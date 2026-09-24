import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from 'crypto';
import { Brackets } from 'typeorm';
import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';
import { Node } from '../models/node.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { TundraAcl } from '../models/tundraAcl.entity';
import { ServerTunnel } from '../models/serverTunnel.entity';
import { ServerTunnelPort, TunnelProtocol } from '../models/serverTunnelPort.entity';
import { ServerTunnelConnection } from '../models/serverTunnelConnection.entity';
import { ServerSubuser } from '../models/serverSubuser.entity';
import { hasPermissionSync } from '../middleware/authorize';

export const TUNDRA_ISSUER = 'control';
export const TUNDRA_PURPOSE = 'tunnel';
export const TUNDRA_TTL = 300;
export const TUNDRA_LEEWAY = 60;

export const TUNDRA_KEY_SEED = 'tundra.jwt_seed';
export const TUNDRA_MASTER_KEY = 'tundra.enabled';
export const TUNDRA_EPOCH_KEY = 'tundra.epoch';
export const TUNDRA_DEFAULT_PORT = 'tundra.default_tunnel_port';
export const TUNDRA_FULL_MESH = 'tundra.full_mesh_cross_tenant';

function b64url(buf: Uint8Array | Buffer): string {
  return Buffer.from(buf).toString('base64url');
}

export async function getSetting(key: string): Promise<string | undefined> {
  try {
    const row = await AppDataSource.getRepository(PanelSetting).findOneBy({ key });
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const repo = AppDataSource.getRepository(PanelSetting);
  const existing = await repo.findOneBy({ key });
  if (existing) {
    existing.value = value;
    await repo.save(existing);
  } else {
    await repo.save(repo.create({ key, value }));
  }
}

export async function isTundraEnabled(): Promise<boolean> {
  const v = await getSetting(TUNDRA_MASTER_KEY);
  return v === undefined || v === 'true' || v === '1';
}

export async function getEpoch(): Promise<number> {
  const v = await getSetting(TUNDRA_EPOCH_KEY);
  const n = Number(v || '0');
  return Number.isFinite(n) ? n : 0;
}

export async function bumpEpoch(): Promise<number> {
  const next = (await getEpoch()) + 1;
  await setSetting(TUNDRA_EPOCH_KEY, String(next));
  return next;
}

export async function defaultTunnelPort(): Promise<number> {
  const v = await getSetting(TUNDRA_DEFAULT_PORT);
  const n = Number(v || '5000');
  return Math.min(65535, Math.max(1, Number.isFinite(n) ? n : 5000));
}

export async function getOrCreateJwtSeed(): Promise<Uint8Array> {
  let seedHex = await getSetting(TUNDRA_KEY_SEED);
  if (!seedHex || !/^[0-9a-f]{64}$/i.test(seedHex)) {
    seedHex = randomBytes(32).toString('hex');
    await setSetting(TUNDRA_KEY_SEED, seedHex);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function jwtPublicKeyHex(): Promise<string> {
  const seed = await getOrCreateJwtSeed();
  return Buffer.from(ed25519.getPublicKey(seed)).toString('hex');
}

export interface JwtHeader {
  alg: string;
  typ: string;
}

export interface ConnectClaims {
  iss: string;
  sub: string; // src nuuid
  aud: string; // dst nuuid
  purpose: string;
  iat: number;
  nbf: number;
  exp: number;
  cnf: { 'x5t#S256': string };
}

export async function signConnectToken(
  srcNodeUuid: string,
  dstNodeUuid: string,
  clientCertSha256: Uint8Array,
  now: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const seed = await getOrCreateJwtSeed();

  const header: JwtHeader = { alg: 'EdDSA', typ: 'JWT' };
  const claims: ConnectClaims = {
    iss: TUNDRA_ISSUER,
    sub: srcNodeUuid,
    aud: dstNodeUuid,
    purpose: TUNDRA_PURPOSE,
    iat: now,
    nbf: now,
    exp: now + TUNDRA_TTL,
    cnf: { 'x5t#S256': b64url(clientCertSha256) },
  };

  const encHeader = b64url(Buffer.from(JSON.stringify(header)));
  const encPayload = b64url(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encPayload}`;
  const signature = ed25519.sign(Buffer.from(signingInput), seed);
  return `${signingInput}.${b64url(signature)}`;
}

export interface PortSpec {
  port: number;
  proto: 'tcp' | 'udp' | 'both';
}

export interface NodeEntry {
  uuid: string;
  name: string;
  host: string;
  tunnel_port: number;
  cert_sha256: string | null;
}

export interface ServerEntry {
  uuid: string;
  idx: number;
  node_uuid: string;
  name: string;
  aliases: string[];
  container_ref: string | null;
  dial_addr: string | null;
  ports: PortSpec[];
}

export interface AclEntry {
  src_server: string;
  dst_server: string;
}

export interface Snapshot {
  epoch: number;
  jwt_pubkey: string;
  nodes: NodeEntry[];
  servers: ServerEntry[];
  acls: AclEntry[];
}

/** Derive a stable short identity for the node's tunnel host from its config. */
function nodeHost(node: Node): string {
  if (node.fqdn && node.fqdn.trim()) return node.fqdn.trim();
  if (node.defaultIp && node.defaultIp.trim()) return node.defaultIp.trim();
  try {
    const host = new URL(node.url.startsWith('http') ? node.url : `http://${node.url}`);
    if (host.hostname.trim()) return host.hostname.trim();
  } catch {}
  return node.url?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || node.name || '';
}

export const MAX_SERVER_IDX = 255 * 256 - 1;

export function aliasOf(uuid: string): string {
  const hex = uuid.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return (hex || '0000000000000000').slice(-8);
}

export function frontendAddress(idx: number): string | null {
  if (!Number.isInteger(idx) || idx < 0 || idx > MAX_SERVER_IDX) return null;
  return `127.0.${1 + Math.floor(idx / 256)}.${idx % 256}`;
}

export function isAliasShaped(name: string): boolean {
  return name.length === 8 && /^[0-9a-f]+$/.test(name);
}

export function validateTunnelName(name: string): string | null {
  if (name.length === 0 || name.length > 63) return 'name must be 1 to 63 characters';
  if (!/^[a-z0-9-]+$/.test(name)) {
    return 'name must only contain lowercase letters, digits and dashes';
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return 'name must not start or end with a dash';
  }
  if (isAliasShaped(name)) {
    return 'name must not be eight hexadecimal characters, which is reserved for the address every server keeps';
  }
  return null;
}

export function suggestTunnelName(serverName: string): string {
  let base = '';
  for (const ch of serverName) {
    if (/[a-z0-9]/.test(ch)) base += ch;
    else if (/[A-Z]/.test(ch)) base += ch.toLowerCase();
    else if (!base.endsWith('-')) base += '-';
  }
  base = base.replace(/^-+|-+$/g, '').slice(0, 58).replace(/-+$/g, '');
  if (!base) base = 'server';
  return isAliasShaped(base) ? `${base}-1` : base;
}

function allocationPorts(cfg: ServerConfig): PortSpec[] {
  const alloc = (cfg.allocations || {}) as Record<string, any>;
  const set = new Set<number>();

  const defaultAlloc = alloc.default;
  if (defaultAlloc && typeof defaultAlloc === 'object') {
    const p = Number(defaultAlloc.port);
    if (Number.isInteger(p) && p > 0 && p <= 65535) set.add(p);
  }

  const mappings = alloc.mappings || {};
  for (const [ip, ports] of Object.entries(mappings)) {
    void ip;
    if (Array.isArray(ports)) {
      for (const raw of ports) {
        const p = Number(raw);
        if (Number.isInteger(p) && p > 0 && p <= 65535) set.add(p);
      }
    }
  }

  return [...set].sort((a, b) => a - b).map(port => ({ port, proto: 'both' as const }));
}

export async function allocateIndex(): Promise<number> {
  const repo = AppDataSource.getRepository(ServerTunnel);
  const rows = await repo
    .createQueryBuilder('t')
    .select('t.idx', 'idx')
    .orderBy('t.idx', 'ASC')
    .getRawMany();
  const used = new Set(rows.map(r => Number(r.idx)));
  for (let idx = 0; idx <= MAX_SERVER_IDX; idx++) {
    if (!used.has(idx)) return idx;
  }
  throw new Error('the private network is full, no frontend index is available');
}

export async function buildSnapshot(): Promise<Snapshot> {
  const enabled = await isTundraEnabled();
  const defaultPort = await defaultTunnelPort();
  const jwt_pubkey = await jwtPublicKeyHex();

  const nodeRepo = AppDataSource.getRepository(Node);

  const empty: Snapshot = {
    epoch: await getEpoch(),
    jwt_pubkey,
    nodes: [],
    servers: [],
    acls: [],
  };

  if (!enabled) {
    return empty;
  }

  const nodes = await nodeRepo.find();
  const wingsNodes = nodes.filter(
    n =>
      n.provider === 'wings' &&
      n.nodeId &&
      n.nodeId.trim() &&
      n.tundraEnabled !== false
  );

  const nodeEntries: NodeEntry[] = [];
  for (const node of wingsNodes) {
    const uuid = String(node.nodeId!).trim();
    const tunnelPort = Number(node.tundraTunnelPort || 0) || defaultPort;
    nodeEntries.push({
      uuid,
      name: node.name,
      host: nodeHost(node),
      tunnel_port: Math.min(65535, Math.max(1, tunnelPort)),
      cert_sha256: node.tundraCertSha256 || null,
    });
  }

  const nodeUuidByIntId = new Map<number, string>();
  for (const node of wingsNodes) {
    if (node.nodeId?.trim()) nodeUuidByIntId.set(node.id, String(node.nodeId).trim());
  }

  const tunnelRepo = AppDataSource.getRepository(ServerTunnel);
  const portRepo = AppDataSource.getRepository(ServerTunnelPort);
  const cfgRepo = AppDataSource.getRepository(ServerConfig);

  const tunnels = await tunnelRepo.find();
  const enrolledEntry = new Map<string, ServerTunnel>();
  if (tunnels.length) {
    const cfgs = await cfgRepo.createQueryBuilder('cfg')
      .where('cfg.uuid IN (:...uuids)', { uuids: tunnels.map(t => t.serverUuid) })
      .andWhere('cfg.suspended = :suspended', { suspended: false })
      .getMany();
    const cfgByUuid = new Map(cfgs.map(c => [String(c.uuid), c]));
    for (const t of tunnels) {
      const cfg = cfgByUuid.get(String(t.serverUuid));
      if (!cfg || !nodeUuidByIntId.has(cfg.nodeId)) continue;
      enrolledEntry.set(String(t.serverUuid), t);
    }
  }

  const serverEntries: ServerEntry[] = [];
  if (enrolledEntry.size) {
    const ports = await portRepo.find();
    const portsByUuid = new Map<string, PortSpec[]>();
    for (const p of ports) {
      const list = portsByUuid.get(p.serverUuid) || [];
      const protos = Array.isArray(p.protocols) ? p.protocols : [];
      const tcp = protos.includes('tcp');
      const udp = protos.includes('udp');
      if (!tcp && !udp) continue;
      list.push({ port: p.port, proto: tcp && udp ? 'both' : tcp ? 'tcp' : 'udp' });
      portsByUuid.set(p.serverUuid, list);
    }

    for (const [serverUuid, tunnel] of enrolledEntry) {
      const cfg = await cfgRepo.findOneBy({ uuid: serverUuid });
      if (!cfg || !nodeUuidByIntId.has(cfg.nodeId)) continue;
      serverEntries.push({
        uuid: serverUuid,
        idx: tunnel.idx,
        node_uuid: String(nodeUuidByIntId.get(cfg.nodeId)).trim(),
        name: tunnel.name || cfg.name || serverUuid,
        aliases: [aliasOf(serverUuid)],
        container_ref: "",
        dial_addr: null,
        ports: (portsByUuid.get(serverUuid) || []).sort((a, b) => a.port - b.port),
      });
    }
  }

  const aclEntries: AclEntry[] = [];
  const serverByUuid = new Map(serverEntries.map(s => [s.uuid, s]));

  const connRepo = AppDataSource.getRepository(ServerTunnelConnection);
  const connRows = await connRepo.find();
  const pairKey = (a: string, b: string) => `${a}|${b}`;
  const pairs = new Set<string>();
  for (const c of connRows) {
    const src = String(c.srcServer).trim();
    const dst = String(c.dstServer).trim();
    if (!src || !dst || src === dst) continue;
    if (c.status === 'pending') continue;
    if (!serverByUuid.has(src) || !serverByUuid.has(dst)) continue;
    if (!pairs.has(pairKey(src, dst))) {
      pairs.add(pairKey(src, dst));
      aclEntries.push({ src_server: src, dst_server: dst });
    }
  }

  if ((await getSetting(TUNDRA_FULL_MESH)) === 'true') {
    for (const a of serverEntries) {
      for (const b of serverEntries) {
        if (a.uuid === b.uuid) continue;
        if (!pairs.has(pairKey(a.uuid, b.uuid))) {
          pairs.add(pairKey(a.uuid, b.uuid));
          aclEntries.push({ src_server: a.uuid, dst_server: b.uuid });
        }
      }
    }
  }

  const explicitAcl = await AppDataSource.getRepository(TundraAcl).find();
  for (const e of explicitAcl) {
    const src = String(e.srcServer).trim();
    const dst = String(e.dstServer).trim();
    if (!src || !dst || src === dst) continue;
    if (serverByUuid.has(src) && serverByUuid.has(dst) && !pairs.has(pairKey(src, dst))) {
      pairs.add(pairKey(src, dst));
      aclEntries.push({ src_server: src, dst_server: dst });
    }
  }

  aclEntries.sort((a, b) => (a.src_server + a.dst_server).localeCompare(b.src_server + b.dst_server));

  return {
    epoch: await getEpoch(),
    jwt_pubkey,
    nodes: nodeEntries,
    servers: serverEntries,
    acls: aclEntries,
  };
}

export async function storeNodeCert(nodeId: number, certSha256Hex: string): Promise<boolean> {
  const trimmed = String(certSha256Hex || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(trimmed)) return false;
  const repo = AppDataSource.getRepository(Node);
  const node = await repo.findOneBy({ id: nodeId });
  if (!node) return false;
  const changed = (node.tundraCertSha256 || '') !== trimmed;
  node.tundraCertSha256 = trimmed;
  await repo.save(node);
  if (changed) {
    await bumpEpoch();
    await pokeAllNodes();
  }
  return true;
}

export async function issueConnectToken(
  srcNodeUuid: string,
  targetUuid: string
): Promise<string> {
  const snapshot = await buildSnapshot();
  const src = snapshot.nodes.find(n => n.uuid === srcNodeUuid);
  const dst = snapshot.nodes.find(n => n.uuid === targetUuid);
  if (!src || !dst) {
    throw new Error('Tundra connect target is not part of the mesh');
  }
  if (!src.cert_sha256) {
    throw new Error('Node has no certificate yet — wait for the first /tunnel/cert report');
  }

  const certHex = src.cert_sha256;
  const certBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) certBytes[i] = parseInt(certHex.slice(i * 2, i * 2 + 2), 16);

  return signConnectToken(srcNodeUuid, targetUuid, certBytes);
}

export interface ApiServerTunnel {
  name: string;
  alias: string;
  address: string | null;
  created: string;
}

export interface ApiServerTunnelPort {
  port: number;
  protocols: TunnelProtocol[];
  created: string;
}

export interface ApiServerTunnelPeer {
  server_uuid: string;
  server_name: string;
  name: string;
  alias: string;
  address: string | null;
  ports: ApiServerTunnelPort[];
  created: string;
  status: 'active' | 'pending';
}

export interface TunnelState {
  supported: boolean;
  tunnel: ApiServerTunnel | null;
  ports: ApiServerTunnelPort[];
  allocation_ports: number[];
  outgoing: ApiServerTunnelPeer[];
  incoming: ApiServerTunnelPeer[];
}

export async function nodeSupportsTunnel(serverUuid: string): Promise<boolean> {
  const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: serverUuid });
  if (!cfg) return false;
  const node = await AppDataSource.getRepository(Node).findOneBy({ id: cfg.nodeId });
  return !!(
    node &&
    node.provider === 'wings' &&
    node.nodeId?.trim() &&
    node.tundraEnabled !== false
  );
}

async function tunnelForServer(serverUuid: string): Promise<ServerTunnel | null> {
  return (await AppDataSource.getRepository(ServerTunnel).findOneBy({ serverUuid })) || null;
}

async function portsForServer(serverUuid: string): Promise<ApiServerTunnelPort[]> {
  const rows = await AppDataSource.getRepository(ServerTunnelPort)
    .createQueryBuilder('p')
    .where('p.serverUuid = :uuid', { uuid: serverUuid })
    .orderBy('p.port', 'ASC')
    .getMany();
  return rows.map(r => ({
    port: r.port,
    protocols: (Array.isArray(r.protocols) ? r.protocols : []) as TunnelProtocol[],
    created: r.createdAt.toISOString(),
  }));
}

async function peersForServer(serverUuid: string, incoming: boolean): Promise<ApiServerTunnelPeer[]> {
  const connRepo = AppDataSource.getRepository(ServerTunnelConnection);
  const tunnelRepo = AppDataSource.getRepository(ServerTunnel);
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const portRepo = AppDataSource.getRepository(ServerTunnelPort);

  const where = incoming ? { dstServer: serverUuid } : { srcServer: serverUuid };
  const conns = await connRepo.findBy(where);
  const peerUuids = conns.map(c => (incoming ? c.srcServer : c.dstServer));
  if (!peerUuids.length) return [];

  const tunnels = await tunnelRepo.createQueryBuilder('t')
    .where('t.serverUuid IN (:...uuids)', { uuids: peerUuids })
    .getMany();
  const tunnelByUuid = new Map(tunnels.map(t => [t.serverUuid, t]));

  const cfgs = await cfgRepo.createQueryBuilder('c')
    .where('c.uuid IN (:...uuids)', { uuids: peerUuids })
    .getMany();
  const cfgByUuid = new Map(cfgs.map(c => [String(c.uuid), c]));

  const ports = await portRepo.createQueryBuilder('p')
    .where('p.serverUuid IN (:...uuids)', { uuids: peerUuids })
    .orderBy('p.port', 'ASC')
    .getMany();
  const portsByUuid = new Map<string, ApiServerTunnelPort[]>();
  for (const p of ports) {
    const list = portsByUuid.get(p.serverUuid) || [];
    list.push({
      port: p.port,
      protocols: (Array.isArray(p.protocols) ? p.protocols : []) as TunnelProtocol[],
      created: p.createdAt.toISOString(),
    });
    portsByUuid.set(p.serverUuid, list);
  }

  const peers: ApiServerTunnelPeer[] = [];
  for (const conn of conns) {
    const peerUuid = incoming ? conn.srcServer : conn.dstServer;
    const tunnel = tunnelByUuid.get(peerUuid);
    const cfg = cfgByUuid.get(peerUuid);
    if (!tunnel || !cfg) continue;
    const idx = Number(tunnel.idx) || 0;
    peers.push({
      server_uuid: peerUuid,
      server_name: cfg.name || peerUuid,
      name: tunnel.name,
      alias: aliasOf(peerUuid),
      address: frontendAddress(idx),
      ports: portsByUuid.get(peerUuid) || [],
      created: conn.createdAt.toISOString(),
      status: conn.status === 'pending' ? 'pending' : 'active',
    });
  }
  peers.sort((a, b) => a.name.localeCompare(b.name));
  return peers;
}

export async function getTunnelState(serverUuid: string): Promise<TunnelState> {
  const supported = await nodeSupportsTunnel(serverUuid);
  const tunnel = await tunnelForServer(serverUuid);
  const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: serverUuid });

  let ports: ApiServerTunnelPort[] = [];
  let outgoing: ApiServerTunnelPeer[] = [];
  let incoming: ApiServerTunnelPeer[] = [];
  if (tunnel) {
    [ports, outgoing, incoming] = await Promise.all([
      portsForServer(serverUuid),
      peersForServer(serverUuid, false),
      peersForServer(serverUuid, true),
    ]);
  }

  let allocationPorts: number[] = [];
  if (cfg) allocationPorts = allocationPortsOf(cfg);

  return {
    supported,
    tunnel: tunnel
      ? {
          name: tunnel.name,
          alias: aliasOf(serverUuid),
          address: frontendAddress(Number(tunnel.idx) || 0),
          created: tunnel.createdAt.toISOString(),
        }
      : null,
    ports,
    allocation_ports: allocationPorts,
    outgoing,
    incoming,
  };
}

function allocationPortsOf(cfg: ServerConfig): number[] {
  return allocationPorts(cfg).map(p => p.port);
}

export async function createTunnel(
  serverUuid: string,
  name?: string | null
): Promise<ApiServerTunnel> {
  const supported = await nodeSupportsTunnel(serverUuid);
  if (!supported) {
    const err: any = new Error("this server's node is not on the private network");
    err.status = 417;
    throw err;
  }
  const existing = await tunnelForServer(serverUuid);
  if (existing) {
    const err: any = new Error('this server is already on the private network');
    err.status = 409;
    throw err;
  }
  const cfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: serverUuid });
  const suggested = suggestTunnelName(cfg?.name || 'server');
  let finalName = typeof name === 'string' && name.trim() ? name.trim() : suggested;
  const nameError = validateTunnelName(finalName);
  if (nameError) {
    const err: any = new Error(nameError);
    err.status = 400;
    throw err;
  }

  const idx = await allocateIndex();
  const repo = AppDataSource.getRepository(ServerTunnel);
  const tunnel = repo.create({ serverUuid, idx, name: finalName, alias: aliasOf(serverUuid) });
  await repo.save(tunnel);
  await bumpEpoch();
  return {
    name: tunnel.name,
    alias: tunnel.alias || aliasOf(serverUuid),
    address: frontendAddress(idx),
    created: tunnel.createdAt.toISOString(),
  };
}

export async function updateTunnel(serverUuid: string, name: string): Promise<ApiServerTunnel> {
  const tunnel = await tunnelForServer(serverUuid);
  if (!tunnel) {
    const err: any = new Error('this server is not on the private network');
    err.status = 404;
    throw err;
  }
  const trimmed = String(name || '').trim();
  const nameError = validateTunnelName(trimmed);
  if (nameError) {
    const err: any = new Error(nameError);
    err.status = 400;
    throw err;
  }

  tunnel.name = trimmed;
  await AppDataSource.getRepository(ServerTunnel).save(tunnel);
  await bumpEpoch();
  return {
    name: tunnel.name,
    alias: tunnel.alias || aliasOf(serverUuid),
    address: frontendAddress(Number(tunnel.idx) || 0),
    created: tunnel.createdAt.toISOString(),
  };
}

export async function deleteTunnel(serverUuid: string): Promise<void> {
  const tunnel = await tunnelForServer(serverUuid);
  if (!tunnel) {
    const err: any = new Error('this server is not on the private network');
    err.status = 404;
    throw err;
  }
  await AppDataSource.getRepository(ServerTunnelPort).delete({ serverUuid });
  await AppDataSource.getRepository(ServerTunnelConnection).delete({ srcServer: serverUuid });
  await AppDataSource.getRepository(ServerTunnelConnection).delete({ dstServer: serverUuid });
  await AppDataSource.getRepository(ServerTunnel).delete({ serverUuid });
  await bumpEpoch();
}

export interface TunnelPortInput {
  port: number;
  protocols: TunnelProtocol[];
}

export async function replaceTunnelPorts(
  serverUuid: string,
  input: TunnelPortInput[]
): Promise<void> {
  if (!(await tunnelForServer(serverUuid))) {
    const err: any = new Error('this server is not on the private network');
    err.status = 404;
    throw err;
  }
  if (input.length > 20) {
    const err: any = new Error('maximum number of private network ports reached');
    err.status = 417;
    throw err;
  }
  const seen = new Set<number>();
  for (const p of input) {
    const port = Number(p.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      const err: any = new Error(`invalid port: ${p.port}`);
      err.status = 400;
      throw err;
    }
    if (seen.has(port)) {
      const err: any = new Error('the same port was listed more than once');
      err.status = 400;
      throw err;
    }
    seen.add(port);
    const protos = Array.isArray(p.protocols) ? p.protocols : ['tcp'];
    if (!protos.some(x => x === 'tcp' || x === 'udp')) {
      const err: any = new Error('at least one protocol is required');
      err.status = 400;
      throw err;
    }
  }

  const peers = await peersForServer(serverUuid, true);
  const peerUuids = peers.filter(p => p.status !== 'pending').map(p => p.server_uuid);
  if (peerUuids.length) {
    const cfgs = await AppDataSource.getRepository(ServerConfig)
      .createQueryBuilder('c')
      .where('c.uuid IN (:...uuids)', { uuids: peerUuids })
      .getMany();
    for (const cfg of cfgs) {
      const alloc = allocationPortsOf(cfg);
      for (const port of alloc) {
        if (seen.has(port)) {
          const err: any = new Error(
            `port ${port} is already used by ${cfg.name || ''}, which is connected to this server; it cannot host a connection on a port it binds itself`
          );
          err.status = 409;
          throw err;
        }
      }
    }
  }

  const repo = AppDataSource.getRepository(ServerTunnelPort);
  await repo.delete({ serverUuid });
  for (const p of input) {
    await repo.save(
      repo.create({
        serverUuid,
        port: Number(p.port),
        protocols: (Array.isArray(p.protocols) ? p.protocols : ['tcp']) as TunnelProtocol[],
      })
    );
  }
  await bumpEpoch();
}

export async function createTunnelConnection(serverUuid: string, targetUuid: string): Promise<void> {
  if (serverUuid === targetUuid) {
    const err: any = new Error('a server cannot be connected to itself');
    err.status = 400;
    throw err;
  }
  const srcTunnel = await tunnelForServer(serverUuid);
  if (!srcTunnel) {
    const err: any = new Error('this server is not on the private network');
    err.status = 417;
    throw err;
  }
  const targetCfg = await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: targetUuid });
  if (!targetCfg) {
    const err: any = new Error('server not found');
    err.status = 404;
    throw err;
  }
  if (targetCfg.suspended) {
    const err: any = new Error('that server is suspended');
    err.status = 409;
    throw err;
  }
  const targetTunnel = await tunnelForServer(targetUuid);
  if (!targetTunnel) {
    const err: any = new Error('that server is not on the private network');
    err.status = 417;
    throw err;
  }

  const count = await AppDataSource.getRepository(ServerTunnelConnection)
    .createQueryBuilder('c')
    .where('c.srcServer = :uuid', { uuid: serverUuid })
    .getCount();
  if (count >= 25) {
    const err: any = new Error('maximum number of connections reached');
    err.status = 417;
    throw err;
  }

  const srcAlloc = allocationPortsOf(
    (await AppDataSource.getRepository(ServerConfig).findOneBy({ uuid: serverUuid }))!
  );
  if (srcAlloc.length) {
    const targetPorts = await portsForServer(targetUuid);
    for (const port of targetPorts) {
      if (srcAlloc.includes(port.port)) {
        const err: any = new Error(
          `port ${port.port} is already used by this server's own allocations, so it cannot also reach the target on it`
        );
        err.status = 409;
        throw err;
      }
    }
  }

  const connRepo = AppDataSource.getRepository(ServerTunnelConnection);
  const existing = await connRepo.findOneBy({ srcServer: serverUuid, dstServer: targetUuid });
  if (existing) {
    if (existing.status === 'pending') {
      const err: any = new Error('a connection request to that server is already pending');
      err.status = 409;
      throw err;
    }
    const err: any = new Error('that server is already connected');
    err.status = 409;
    throw err;
  }
  await connRepo.save(connRepo.create({ srcServer: serverUuid, dstServer: targetUuid, dstName: targetTunnel.name, status: 'pending' }));
  await bumpEpoch();
}

export async function acceptTunnelConnection(serverUuid: string, srcUuid: string): Promise<boolean> {
  const connRepo = AppDataSource.getRepository(ServerTunnelConnection);
  const conn = await connRepo.findOneBy({ srcServer: srcUuid, dstServer: serverUuid });
  if (!conn || conn.status !== 'pending') return false;
  conn.status = 'active';
  await connRepo.save(conn);
  await bumpEpoch();
  return true;
}

export async function deleteTunnelConnection(
  serverUuid: string,
  connectionUuid: string,
  incoming: boolean
): Promise<boolean> {
  const src = incoming ? connectionUuid : serverUuid;
  const dst = incoming ? serverUuid : connectionUuid;
  const result = await AppDataSource.getRepository(ServerTunnelConnection).delete({ srcServer: src, dstServer: dst });
  if (result.affected && result.affected > 0) {
    await bumpEpoch();
    return true;
  }
  return false;
}

export async function listAvailableTunnelServers(
  user: any,
  currentServerUuid: string,
  page: number,
  perPage: number,
  search?: string,
  other = false
): Promise<{ total: number; page: number; per_page: number; data: any[] }> {
  const cfgRepo = AppDataSource.getRepository(ServerConfig);

  const qb = cfgRepo.createQueryBuilder('c')
    .innerJoin(ServerTunnel, 't', 't.serverUuid = c.uuid')
    .where('c.suspended = :suspended', { suspended: false })
    .andWhere('c.uuid != :current', { current: currentServerUuid });

  if (other && (user?.role === '*' || user?.role === 'rootAdmin' || hasPermissionSync({ user }, 'servers:list'))) {
    // woaaaaaaaaa ur adminnn aboozeeee
  } else {
    const subuser = await AppDataSource.getRepository(ServerSubuser).findBy({
      userId: user.id,
      accepted: true,
    });
    const subUuids = subuser.map(s => s.serverUuid);
    qb.andWhere(
      new Brackets(where => {
        where.where('c.userId = :owner', { owner: user.id });
        if (subUuids.length) where.orWhere('c.uuid IN (:...sub)', { sub: subUuids });
      })
    );
  }

  if (search && search.trim()) {
    qb.andWhere('(c.name LIKE :search)', { search: `%${search.trim()}%` });
  }

  const [rows, total] = await qb
    .orderBy('c.name', 'ASC')
    .skip((page - 1) * perPage)
    .take(perPage)
    .getManyAndCount();

  const data = await Promise.all(
    rows.map(async cfg => {
      const tunnel = await tunnelForServer(String(cfg.uuid));
      return {
        uuid: cfg.uuid,
        name: cfg.name || cfg.uuid,
        tunnel: tunnel
          ? {
              name: tunnel.name,
              alias: aliasOf(String(cfg.uuid)),
              address: frontendAddress(Number(tunnel.idx) || 0),
              created: tunnel.createdAt.toISOString(),
            }
          : null,
      };
    })
  );

  return { total, page, per_page: perPage, data };
}

export async function pokeAllNodes(): Promise<void> {
  const nodeRepo = AppDataSource.getRepository(Node);
  const nodes = await nodeRepo.find();
  const wingsNodes = nodes.filter(
    n => n.provider === 'wings' && n.nodeId?.trim() && n.tundraEnabled !== false
  );
  const { WingsApiService } = await import('./wingsApiService');
  await Promise.allSettled(
    wingsNodes.map(async node => {
      try {
        const base = node.backendWingsUrl || node.url;
        const svc = new WingsApiService(base, node.token || '');
        await svc.syncTundra();
      } catch (err) {
        // trust me, its better than before
        console.log(`failed to poke node ${node.name} (${node.id}):`, err);
      }
    })
  );
}