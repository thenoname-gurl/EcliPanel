CREATE TABLE `user` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `firstName` varchar(255) NOT NULL,
  `middleName` varchar(255),
  `lastName` varchar(255) NOT NULL,
  `address` text NOT NULL,
  `avatarUrl` varchar(255),
  `address2` text,
  `phone` varchar(255),
  `email` varchar(255) NOT NULL UNIQUE,
  `passwordHash` varchar(255) NOT NULL,
  `role` varchar(255),
  `portalType` varchar(255) NOT NULL DEFAULT 'free',
  `orgId` int,
  `orgRole` varchar(50) DEFAULT 'member',
  `limits` json,
  `educationLimits` json,
  `settings` json,
  `sessions` json,
  `emailVerified` tinyint(1) DEFAULT 0,
  `studentVerified` tinyint(1) DEFAULT 0,
  `studentVerifiedAt` datetime,
  `idVerified` tinyint(1) DEFAULT 0,
  `deletionRequested` tinyint(1) DEFAULT 0,
  `deletionApproved` tinyint(1) DEFAULT 0
);

CREATE TABLE `organisation` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `handle` varchar(255) NOT NULL UNIQUE,
  `ownerId` int NOT NULL,
  `avatarUrl` varchar(255)
);

CREATE TABLE `organisation_invite` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `organisationId` int NOT NULL,
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `accepted` tinyint(1) DEFAULT 0,
  `createdAt` datetime NOT NULL
);

CREATE TABLE `role` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) NOT NULL UNIQUE,
  `description` varchar(255)
);

CREATE TABLE `permission` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `value` varchar(255) NOT NULL,
  `roleId` int NOT NULL
);

CREATE TABLE `user_role` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userId` int NOT NULL,
  `roleId` int NOT NULL
);

CREATE TABLE `id_verification` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userId` int NOT NULL,
  `status` varchar(50) NOT NULL,
  `provider` varchar(255) NOT NULL,
  `verifiedAt` datetime,
  `idDocumentUrl` text,
  `selfieUrl` text
);

CREATE TABLE `legal_document` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `type` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `version` varchar(255) NOT NULL,
  `publishedAt` datetime NOT NULL
);

CREATE TABLE `deletion_request` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userId` int NOT NULL,
  `status` varchar(50) NOT NULL,
  `requestedAt` datetime NOT NULL,
  `approvedBy` int,
  `idVerified` tinyint(1) DEFAULT 0
);

CREATE TABLE `order` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userId` int NOT NULL,
  `items` text NOT NULL,
  `amount` float NOT NULL,
  `status` varchar(50) NOT NULL,
  `createdAt` datetime NOT NULL,
  `expiresAt` datetime NOT NULL
);

CREATE TABLE `user_log` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userId` int NOT NULL,
  `action` text NOT NULL,
  `timestamp` datetime NOT NULL
);

CREATE TABLE `plan` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `price` float NOT NULL,
  `features` json
);

CREATE TABLE `soc_data` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `serverId` varchar(255) NOT NULL,
  `metrics` json NOT NULL,
  `timestamp` datetime NOT NULL
);

CREATE TABLE `ai_model` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `config` json,
  `limits` json
);

CREATE TABLE `ai_model_user` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `modelId` int NOT NULL,
  `userId` int NOT NULL,
  `limits` json
);

CREATE TABLE `ai_model_org` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `modelId` int NOT NULL,
  `organisationId` int NOT NULL,
  `limits` json
);

CREATE TABLE `passkey` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `userId` int NOT NULL,
  `credentialID` varchar(255) NOT NULL,
  `publicKey` text NOT NULL,
  `counter` bigint NOT NULL,
  `transports` varchar(255) NOT NULL
);

CREATE TABLE `node` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255) NOT NULL UNIQUE,
  `url` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `organisationId` int,
  `rootUser` varchar(255),
  `rootPassword` varchar(255)
);

CREATE TABLE `server_mapping` (
  `uuid` varchar(255) PRIMARY KEY,
  `nodeId` int NOT NULL
);

CREATE TABLE `api_key` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `key` varchar(255) NOT NULL UNIQUE,
  `name` varchar(255) NOT NULL,
  `type` varchar(20) NOT NULL,
  `permissions` json,
  `userId` int,
  `createdAt` datetime NOT NULL,
  `expiresAt` datetime
);