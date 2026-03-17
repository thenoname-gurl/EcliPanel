#!/usr/bin/env bash
# A simple script that migrates important data from EcliPanel v1
#  NOTE: This is a starting point, there were multiple undocumented manual migrations during v1 to v3 migrations!
# DEPRECATED: This script is no longer maintained and exist only for showcase!
# I spent 4 hours after running this script doing manual changes to datatables to make stuff work
# DONT USE  THIS EVER AGAIN  I  SWEARRRR
set -euo pipefail

print_help() {
  cat <<'EOF'
Usage: migrate.sh [options]

Options:
  --src-user USER       Source MySQL username (Jexactyl database)
  --src-pass PASS       Source MySQL password
  --src-db   DB         Source MySQL database
  --src-host HOST       Source MySQL host (default: 127.0.0.1)
  --src-port PORT       Source MySQL port (default: 3306)

  --dst-user USER       Destination MySQL username (EcliPanel database)
  --dst-pass PASS       Destination MySQL password
  --dst-db   DB         Destination MySQL database
  --dst-host HOST       Destination MySQL host (default: 127.0.0.1)
  --dst-port PORT       Destination MySQL port (default: 3306)
  --dst-ssl 0|1         Set destination mysql client SSL (0=disable, 1=enable)

  -h, --help            Show this help message
EOF
}

SRC_HOST="127.0.0.1"
SRC_PORT=3306
SRC_SSL=""
DST_HOST="127.0.0.1"
DST_PORT=3306
DST_SSL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src-user) SRC_USER="$2"; shift 2;;
    --src-pass) SRC_PASS="$2"; shift 2;;
    --src-db)   SRC_DB="$2"; shift 2;;
    --src-host) SRC_HOST="$2"; shift 2;;
    --src-port) SRC_PORT="$2"; shift 2;;
    --src-ssl) SRC_SSL="$2"; shift 2;;
    --dst-user) DST_USER="$2"; shift 2;;
    --dst-pass) DST_PASS="$2"; shift 2;;
    --dst-db)   DST_DB="$2"; shift 2;;
    --dst-host) DST_HOST="$2"; shift 2;;
    --dst-port) DST_PORT="$2"; shift 2;;
    --dst-ssl) DST_SSL="$2"; shift 2;;
    -h|--help) print_help; exit 0;;
    *) echo "Unknown option: $1" >&2; print_help; exit 1;;
  esac
done

for v in SRC_USER SRC_PASS SRC_DB DST_USER DST_PASS DST_DB; do
  if [[ -z "${!v-}" ]]; then
    echo "Missing required option: $v" >&2
    print_help
    exit 1
  fi
done

MYSQL_SRC_SSL_OPTS=""
MYSQL_DST_SSL_OPTS=""
if [[ "$SRC_SSL" == "0" ]]; then
  MYSQL_SRC_SSL_OPTS="--ssl=0"
elif [[ "$SRC_SSL" == "1" ]]; then
  MYSQL_SRC_SSL_OPTS="--ssl=1"
fi
if [[ "$DST_SSL" == "0" ]]; then
  MYSQL_DST_SSL_OPTS="--ssl=0"
elif [[ "$DST_SSL" == "1" ]]; then
  MYSQL_DST_SSL_OPTS="--ssl=1"
fi

mysql $MYSQL_DST_SSL_OPTS --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" -e "CREATE DATABASE IF NOT EXISTS \`$DST_DB\`;"

if ! mysql $MYSQL_DST_SSL_OPTS --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" -sN -e "SELECT 1 FROM information_schema.tables WHERE table_schema='$DST_DB' AND table_name='user' LIMIT 1" | grep -q 1; then
  mysql $MYSQL_DST_SSL_OPTS --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" < "$(dirname "$0")/../database.sql"
fi

mysql $MYSQL_DST_SSL_OPTS --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
CREATE TABLE IF NOT EXISTS database_host (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 3306,
  username VARCHAR(255) NOT NULL,
  password TEXT NOT NULL,
  nodeId INT DEFAULT NULL,
  maxDatabases INT NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ssh_key (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  publicKey TEXT NOT NULL,
  fingerprint VARCHAR(255) DEFAULT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS egg (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  dockerImage VARCHAR(255) NOT NULL,
  startup TEXT NOT NULL,
  envVars LONGTEXT DEFAULT NULL,
  configFiles LONGTEXT DEFAULT NULL,
  visible TINYINT(4) NOT NULL DEFAULT 1,
  createdAt DATETIME(6) NOT NULL DEFAULT current_timestamp(6),
  updatedAt DATETIME(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  author TEXT DEFAULT NULL,
  dockerImages LONGTEXT DEFAULT NULL,
  processConfig LONGTEXT DEFAULT NULL,
  installScript LONGTEXT DEFAULT NULL,
  features LONGTEXT DEFAULT NULL,
  fileDenylist LONGTEXT DEFAULT NULL,
  updateUrl TEXT DEFAULT NULL
);
"
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT
mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  id,
  username,
  '',
  email,
  password,
  CASE WHEN root_admin = 1 THEN 'admin' ELSE 'user' END,
  'free',
  (email_verified_at IS NOT NULL),
  (id_verification_status = 'verified'),
  (deletion_requested_at IS NOT NULL),
  0,
  COALESCE(REPLACE(REPLACE(billing_address, '\\t', '\\t'), '\\n', '\\n'), ''),
  NULL
FROM users;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE user
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(id, firstName, lastName, email, passwordHash, role, portalType, emailVerified, idVerified, deletionRequested, deletionApproved, address, phone);"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  id,
  name,
  CONCAT(scheme, '://', fqdn),
  daemon_token,
  NULL,
  NULL,
  NULL
FROM nodes;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE node
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(id, name, url, token, organisationId, rootUser, rootPassword);"

mysql $MYSQL_DST_SSL_OPTS --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
UPDATE node SET organisationId = NULL WHERE organisationId IS NOT NULL;"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  uuid,
  node_id
FROM servers;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE server_mapping
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(uuid, nodeId);"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  uuid,
  node_id,
  owner_id,
  name,
  description,
  0 AS suspended,
  0 AS hibernated,
  NULL AS environment,
  image AS dockerImage,
  startup,
  memory,
  disk,
  cpu,
  swap,
  io AS ioWeight,
  CASE WHEN oom_killer = 0 THEN 1 ELSE 0 END AS oomDisabled,
  egg_id,
  skip_scripts AS skipEggScripts,
  NULL AS allocations,
  NULL AS schedules,
  NULL AS processConfig,
  COALESCE(database_limit, 0) AS maxDatabases,
  COALESCE(backup_limit, 0) AS maxBackups,
  COALESCE(created_at, NOW())
FROM servers;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE server_config
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(uuid, nodeId, userId, name, description, suspended, hibernated, environment, dockerImage, startup, memory, disk, cpu, swap, ioWeight, oomDisabled, eggId, skipEggScripts, allocations, schedules, processConfig, maxDatabases, maxBackups, createdAt);"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  id,
  user_id,
  JSON_OBJECT('name', name, 'description', description, 'productId', product_id),
  total,
  status,
  COALESCE(created_at, NOW()),
  COALESCE(expires_at, created_at, NOW())
FROM orders;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE \`order\`
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(id, userId, items, amount, status, createdAt, expiresAt);"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  id,
  name,
  description,
  NULLIF(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(docker_images, '$[0]')), ''), 'NULL'),
  NULLIF(COALESCE(startup, config_startup), 'NULL'),
  NULLIF(config_files, 'NULL'),
  author,
  NULLIF(docker_images, 'NULL'),
  JSON_OBJECT(
    'container', script_container,
    'entrypoint', script_entry,
    'script', script_install
  ),
  NULLIF(features, 'NULL'),
  NULLIF(file_denylist, 'NULL'),
  NULLIF(update_url, 'NULL'),
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM eggs;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE egg
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(id, name, description, dockerImage, startup, configFiles, author, dockerImages, installScript, features, fileDenylist, updateUrl, createdAt, updatedAt);"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  id,
  name,
  host,
  port,
  username,
  password,
  node_id,
  COALESCE(max_databases, 0),
  COALESCE(created_at, NOW())
FROM database_hosts;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE database_host
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(id, name, host, port, username, password, nodeId, maxDatabases, createdAt);"

tmpfile=$(mktemp)

mysql --batch --raw --skip-column-names --user="$SRC_USER" --password="$SRC_PASS" --host="$SRC_HOST" --port="$SRC_PORT" --database="$SRC_DB" -e "
SELECT
  id,
  user_id,
  name,
  public_key,
  fingerprint,
  COALESCE(created_at, NOW())
FROM user_ssh_keys;" > "$tmpfile"

mysql $MYSQL_DST_SSL_OPTS --local-infile=1 --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
LOAD DATA LOCAL INFILE '$tmpfile'
INTO TABLE ssh_key
FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n'
(id, userId, name, publicKey, fingerprint, createdAt);"

mysql $MYSQL_DST_SSL_OPTS --user="$DST_USER" --password="$DST_PASS" --host="$DST_HOST" --port="$DST_PORT" "$DST_DB" -e "
DELETE FROM ssh_key WHERE userId IS NOT NULL AND userId NOT IN (SELECT id FROM \`user\`);"


cat <<'EOF'

Migration completed 
EOF