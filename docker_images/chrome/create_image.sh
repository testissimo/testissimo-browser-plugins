cd ..
cd ..
docker build . -f docker_images/chrome/Dockerfile -t testissimo-chrome
# docker build --no-cache . -f chrome_docker/Dockerfile -t testissimo-chrome