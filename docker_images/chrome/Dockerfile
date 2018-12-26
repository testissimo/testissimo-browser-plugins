FROM debian:9-slim

RUN apt-get update
RUN apt-get install -y xvfb wget gnupg2

# install nginx to upstream proxy to localhost
RUN apt-get install -y nginx
RUN printf "worker_processes  1;\n\
events { worker_connections  1024; }\n\
http {\n\
    map \$http_upgrade \$connection_upgrade {\n\
        default upgrade;\n\
        ''      close;\n\
    }\n\
    server {\n\
        listen 9222 default_server;\n\
        server_name	_;\n\
        location / {\n\
            proxy_pass         http://127.0.0.1:9221;\n\
            proxy_http_version 1.1;\n\
            proxy_set_header   Upgrade \$http_upgrade;\n\
            proxy_set_header   Connection \$connection_upgrade;\n\
            proxy_set_header   Host 127.0.0.1;\n\
            break;\n\
        }\n\
    }\n\
}" > /etc/nginx/nginx.conf

# expose proxy port
EXPOSE 9222

# install google chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y dbus-x11 google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# create xvfb service init script
RUN printf "#!/bin/bash\n\
XVFB=/usr/bin/Xvfb\n\
SCREEN=\$(($BROWSER_WIDTH + 10))x\$((BROWSER_HEIGHT + 10))x\${COLOR_DEPTH}\n\
XVFBARGS=\"\$DISPLAY -ac -screen 0 \$SCREEN +extension RANDR\"\n\
PIDFILE=/var/xvfb_\${DISPLAY:1}.pid\n\
case \"\$1\" in\n\
  start)\n\
    echo -n \"Starting virtual X frame buffer: Xvfb\"\n\
    /sbin/start-stop-daemon --start --quiet --pidfile \$PIDFILE --make-pidfile --background --exec \$XVFB -- \$XVFBARGS\n\
    echo \".\"\n\
    ;;\n\
  stop)\n\
    echo -n \"Stopping virtual X frame buffer: Xvfb\"\n\
    /sbin/start-stop-daemon --stop --quiet --pidfile \$PIDFILE\n\
    echo \".\"\n\
    ;;\n\
  restart)\n\
    $0 stop\n\
    $0 start\n\
    ;;\n\
  *)\n\
  echo \"Usage: /etc/init.d/xvfb {start|stop|restart}\"\n\
  exit 1\n\
esac\n\
exit 0" > /etc/init.d/xvfb && chmod a+x /etc/init.d/xvfb

# tell xvfb init to use display 0
ENV DISPLAY :0

# set dbus address manually
ENV DBUS_SESSION_BUS_ADDRESS unix:path=/run/dbus/system_bus_socket

# copy testissimo browser plugin
COPY chrome/ext /testissimo-chrome-plugin

# create run script to start all services and chrome
RUN printf "#!/bin/bash\n\
service nginx start\n\
/etc/init.d/dbus start\n\
/etc/init.d/xvfb start\n\
sleep 1\n\
echo \"STARGING CHROME WITH URL: \$URL\"\n\
google-chrome \
--no-sandbox \
--disable-gpu \
--mute-audio \
--no-first-run \
--disable-translate \
--disable-default-apps \
--disable-sync \
--disable-3d-apis \
--disable-accelerated-video \
--disable-background-mode \
--disable-background-networking \
--disable-plugins-discovery \
--disable-preconnect \
--dns-prefetch-disable \
--no-pings \
--metrics-recording-only \
--safebrowsing-disable-auto-update \
--disable-setuid-sandbox \
--remote-debugging-port=9221 \
--remote-debugging-address=0.0.0.0 \
--load-extension=/testissimo-chrome-plugin/ \
--window-size=\$BROWSER_WIDTH,\$BROWSER_HEIGHT \
https://testissimo.io/activate-plugin/\$URL " > /start-chrome.sh && chmod a+x /start-chrome.sh

# browser resolution and color depth
ENV BROWSER_WIDTH 1600
ENV BROWSER_HEIGHT 1200
ENV COLOR_DEPTH 16

# testissismo headless run url
ENV URL https://testissimo.io

# lock entrypoint to start script
ENTRYPOINT [ "sh", "/start-chrome.sh" ]