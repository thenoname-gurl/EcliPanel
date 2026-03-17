FROM alpine:latest

RUN apk add --no-cache ca-certificates coreutils curl btrfs-progs xfsprogs-extra zfs restic && \
	update-ca-certificates

# Add calagopus-wings and entrypoint
ARG TARGETPLATFORM
COPY .docker/${TARGETPLATFORM#linux/}/calagopus-wings /usr/bin/calagopus-wings

ENV OCI_CONTAINER=official

ENTRYPOINT ["/usr/bin/calagopus-wings"]
