cd ..
cd ..
docker build . -f docker_images/chromium/Dockerfile -t testissimo-chromium
# docker build --no-cache . -f docker_images/chromium/Dockerfile -t testissimo-chromium

# docker run --rm -p 9222:9222 testissimo-chromium

# docker tag testissimo-chromium testissimo/browser-chromium:0.4
# docker push testissimo/browser-chromium:0.4