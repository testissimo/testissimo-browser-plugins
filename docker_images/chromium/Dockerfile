FROM alpine:3.7

RUN apk --no-cache upgrade && apk add --no-cache chromium

# copy testissimo browser plugin
COPY chrome/ext /testissimo-chrome-plugin

# create run script to start all services and chrome
RUN printf "#!/bin/bash\n\
echo \"STARGING CHROMIUM WITH URL: \$URL\"\n\
chromium-browser \
--headless \
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
--load-extension=/testissimo-chrome-plugin/ \
--remote-debugging-port=9222 \
--remote-debugging-address=0.0.0.0 \
--window-size=\$BROWSER_WIDTH,\$BROWSER_HEIGHT \
https://testissimo.io/activate-plugin/\$URL " > /start-chrome.sh && chmod a+x /start-chrome.sh

EXPOSE 9222

# browser resolution and color depth
ENV BROWSER_WIDTH 1600
ENV BROWSER_HEIGHT 1200

# testissismo headless run url
ENV URL https://testissimo.io

# lock entrypoint to start script
ENTRYPOINT [ "sh", "/start-chrome.sh" ]