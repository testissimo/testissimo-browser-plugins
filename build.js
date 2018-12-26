var fs = require('fs'),
    exec = require('child_process').exec,
    manifest = require('./chrome/ext/manifest.json'),
    version = manifest.version;

function removeTempFiles(cb){
    fs.unlink('./chrome/ext/src/.DS_Store', function(){
        cb();
    });
}

function packChrome(cb){
    exec('cd ./chrome && zip -r -X ../dist/chrome-'+manifest.version+'.zip ./ext/', function(err, stdout, stderr){
        if(err) throw err;
        if(cb) cb();
    });
}

function packFirefox(cb){
    exec('cd ./firefox_port && zip -r -X ../dist/firefox-'+manifest.version+'.zip *', function(err, stdout, stderr){
        if(err) throw err;
        if(cb) cb();
    });
}

function createFirefoxManifest(cb){
    var ffManifest = require('./firefox_port/manifest.json')
    ffManifest.applications = {
        gecko:{
            id: 'info@testissimo.io'
        }
    };
    delete ffManifest.background.persistent;
    fs.writeFileSync('./firefox_port/manifest.json', JSON.stringify(ffManifest, null, 2));
    if(cb) cb();
}

function removeFirefoxFolder(cb){
    exec('rm -r ./firefox_port', function(err, stdout, stderr){
        //if(err) throw err;
        if(cb) cb();
    });
}

function copyIntoFirefoxFolder(cb){
    exec('cp -r ./chrome/ext ./firefox_port', function(err, stdout, stderr){
        if(err) throw err;
        if(cb) cb();
    });
}

function removePackages(cb){
    exec('rm -r ./dist/*.zip', function(err, stdout, stderr){
        //if(err) throw err;
        if(cb) cb();
    });
}


var tasks = [ removeTempFiles, removePackages, packChrome, removeFirefoxFolder, copyIntoFirefoxFolder, createFirefoxManifest, packFirefox ];

function runTasks(index){
    index = index || 0;
    if(tasks[index]) tasks[index](function(){
        runTasks(index+1);
    });
}

runTasks();