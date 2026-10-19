FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates dbus gnome-keyring libsecret-tools && rm -rf /var/lib/apt/lists/*
COPY dreamina /usr/local/bin/dreamina
COPY entrypoint.sh /usr/local/bin/dreamina-entrypoint
COPY version.json /opt/dreamina/version.json
RUN chmod 755 /usr/local/bin/dreamina /usr/local/bin/dreamina-entrypoint
ENTRYPOINT ["/usr/local/bin/dreamina-entrypoint"]
