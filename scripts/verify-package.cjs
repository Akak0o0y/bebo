const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(process.argv[2]||'release/constellation/win-unpacked');const archive=path.join(root,'resources/app.asar');const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}}
walk('electron');walk('dist');
for(const file of files){const expected=fs.readFileSync(file),actual=asar.extractFile(archive,path.normalize(file));if(!actual.equals(expected))throw Error('Packaged source differs: '+file);}
const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());if(pkg.name!=='bebo'||pkg.main!=='electron/main.cjs')throw Error('Invalid application entry.');
if(!fs.readFileSync(path.join(root,'resources/windows.ps1')).equals(fs.readFileSync('electron/windows.ps1')))throw Error('Packaged Windows bridge differs.');
if(!fs.readFileSync(path.join(root,'resources/terminal.ps1')).equals(fs.readFileSync('electron/terminal.ps1')))throw Error('Packaged terminal helper differs.');
console.log('PASS: '+files.length+' packaged application files match source; entry, Windows bridge and terminal helper verified.');
