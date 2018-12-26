cd ..
cd ..
docker build . -f docker_images/chrome/Dockerfile -t testissimo-chrome
# docker build --no-cache . -f chrome_docker/Dockerfile -t testissimo-chrome

# create container
# docker run --rm -p 9222:9222 --env URL=http://objectify.ddns.net:31005/dms-app/?testissimo-headless=e82977a4-b6c1-507e-4611-effa0348560c\|rJMaDMbjG\|testSuite:ALL\|\|dev-test testissimo/browser-chrome:0.4
# docker run --rm -p 9222:9222 testissimo-chrome 

# docker tag testissimo-chrome testissimo/browser-chrome:0.4
# docker push testissimo/browser-chrome:0.4


# apiVersion: batch/v1
# kind: Job
# metadata:
#   name: testissimo-headless-dms
# spec:
#   backoffLimit: 1
#   template:
#     spec:
#       containers:
#       - name: testissimo-headless-dms
#         image: testissimo/browser-chrome:0.4
#         env:
#          - name: URL
#            value: "http://objectify.ddns.net:31005/dms-app/?testissimo-headless=e82977a4-b6c1-507e-4611-effa0348560c|rJMaDMbjG|testSuite:ALL||gke-test"
#       restartPolicy: Never


# https://app.testissimo.io/proxy/http://objectify.ddns.net:31005/dms-app/rest/documents/thumbnail?fileDirAndName=images/fileTypeIcon/html.png