const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const Perlin = require('perlin-noise-3d');
const perlin = new Perlin();

// Crée le serveur HTTP pour servir les fichiers du dossier 'www'
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, 'www', req.url === '/' ? 'index.html' : req.url);
    let extname = String(path.extname(filePath)).toLowerCase();
    let mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    let contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile(path.join(__dirname, 'www', '404.html'), (error, content) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
                res.end();
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const cases = {};

const cols = 200;
const rows = 200;

const zSea = 0.15;

function showMap() {
    console.clear();
    for (let x = 0; x < cols; x++) {
        let line = "";
        for (let y = 0; y < rows; y++) {
            let z = cases[x][y].z;
            if (cases[x][y].waterFlowOut ==0) line += "---";
            else if (cases[x][y].waterFlowOut ==1) line += " \\ ";
            else if (cases[x][y].waterFlowOut ==2) line += " / ";
            else if (cases[x][y].waterFlowOut ==3) line += "--";
            else if (cases[x][y].waterFlowOut ==4) line += " \\ ";
            else if (cases[x][y].waterFlowOut ==5) line += " / ";
            else if (z >0.7) line += "^^^";
            else if (z > 0.15) line += "   ";
            else         line += "~~~";
        }
        console.log(line);
    }
}

function initMap() {
    for (let x = 0; x < cols; x++) {
        cases[x] = {};
        for (let y = 0; y < rows; y++) {
            cases[x][y] = false;
        }
    }

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            cases[x][y] = new Case(x,y);
        }
    }
    
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            cases[x][y].fillNeighbors();
        }
    }

    let areBorderSeas = [];
    let nextBorderSeas = [];
    cases[0][0].isBorderSea = true;
    areBorderSeas.push(cases[0][0]);
    while (areBorderSeas.length>0) {
        for (let c of areBorderSeas) {
            for (let n of c.neighbors) {
                if (n && n.isSea && !n.isBorderSea) {
                n.isBorderSea = true;
                nextBorderSeas.push(n);
                }
            }
        }
        areBorderSeas = [];
        areBorderSeas.push(...nextBorderSeas);
        nextBorderSeas = [];
    }

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (cases[x][y].isSea && !cases[x][y].isBorderSea) {
                cases[x][y].isSea = false;
                cases[x][y].z+=0.01;
            }
        }
    }

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (cases[x][y].isWaterSource) {
                cases[x][y].startRiver();
            }
        }
    }

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (cases[x][y].z < 0.55 && cases[x][y].z > 0.2 && !cases[x][y].isSea && perlin.get(x/10.0, y/10.0) > 0.55) {
                cases[x][y].isForest = true;    
            }
            cases[x][y].calcPoints();
        }
    }

    //showMap();
    
}

class Case {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.z = getAltitude(x, y);

        this.background = "sea";
        this.points = [];
        this.waterFlow = [0,0,0,0,0,0];
        this.waterFlowOut = -5;

        this.isSea = false;
        this.seaIndex = -1;

        this.isWaterSource = false;
        if (this.z > 0.7 && this.z < 0.8 && Math.random(1) > 0.85) this.isWaterSource = true;

        this.isBorderSea = false;
        this.isForest = false;

        this.neighbors = [];
        this.calcPoints();
    }

    fillNeighbors() {
        for (let i = 0; i< 6; i++) this.neighbors[i] = false;

        let xUp = this.y%2 == 1 ? this.x+1 : this.x; 
        let xDown = xUp-1; 
        if (xUp >=0 && xUp < cols && this.y+1 < rows) {this.neighbors[0] = cases[xUp][this.y+1];}
        if (this.x+1 < cols) {this.neighbors[1] = cases[this.x+1][this.y];}
        if (xUp >=0 && xUp < cols && this.y-1 > 0) {this.neighbors[2] = cases[xUp][this.y-1];}

        if (xDown >= 0 && this.y-1 > 0) {this.neighbors[3] = cases[xDown][this.y-1];}
        if (this.x-1 > 0) {this.neighbors[4] = cases[this.x-1][this.y];}
        if (xDown >= 0 && this.y+1 < rows) {this.neighbors[5] = cases[xDown][this.y+1];}

    }

    calcPoints() {
        let lineHeightRatio = Math.sqrt(3)/2.0;
        let centerX = this.x;
        let centerY = this.y*lineHeightRatio;
        let xUp = 0; 
        let xDown = -1; 
        if (Math.abs(this.y)%2 == 1) {
          centerX += 0.5; 
          xUp = 1;
          xDown = 0;
        }
        centerX *= Math.sin(Math.PI/3.0);
        centerY *= Math.sin(Math.PI/3.0);
        let deltaX = lineHeightRatio/2.0;
        let deltaY = 0.5/2.0;

        let zM;
        this.points[0] = {"x":centerX,"y":centerY,"z":this.z};
        zM = (this.z+getAltitude(this.x+xUp, this.y+1)+getAltitude(this.x+xDown, this.y+1))/3.0;
        this.points[1] = {"x":centerX,"y":centerY+0.5,"z":zM};
        zM = (this.z+getAltitude(this.x+1, this.y)+getAltitude(this.x+xUp, this.y+1))/3.0;
        this.points[2] = {"x":centerX+deltaX,"y":centerY+deltaY,"z":zM};
        zM = (this.z+getAltitude(this.x+1, this.y)+getAltitude(this.x+xUp, this.y-1))/3.0;
        this.points[3] = {"x":centerX+deltaX,"y":centerY-deltaY,"z":zM};
        zM = (this.z+getAltitude(this.x+xUp, this.y-1)+getAltitude(this.x+xDown, this.y-1))/3.0;
        this.points[4] = {"x":centerX,"y":centerY-0.5,"z":zM};
        zM = (this.z+getAltitude(this.x-1, this.y)+getAltitude(this.x+xDown, this.y-1))/3.0;
        this.points[5] = {"x":centerX-deltaX,"y":centerY-deltaY,"z":zM};
        zM = (this.z+getAltitude(this.x-1, this.y)+getAltitude(this.x+xDown, this.y+1))/3.0;
        this.points[6] = {"x":centerX-deltaX,"y":centerY+deltaY,"z":zM};

        this.isSea = this.z <= zSea;

        if (this.isForest) { this.background = "forest"; }
        else if (this.z <= zSea  || this.isSea) { this.background = "sea"; }
        else if (this.z < 0.18) {    this.background = "sand"; }
        else if (this.z < 0.55) {    this.background = "grass"; }
        else if (this.z < 0.7) { this.background = "rock"; }
        else {  this.background = "snow"; }
    }

    startRiver() {
        let riverHistory = [];
        let currentCase = this;
        let continueRiver = true;
        while (continueRiver) {
            let lowestCase = false;
            for (let i = 0; i< 6; i++) {
                let c = currentCase.neighbors[i];
                if (c && c.z <= currentCase.z && riverHistory.indexOf(c)==-1) { // case is above
                    if ( !lowestCase || lowestCase.z > c.z) { // case is above the lowest
                        lowestCase = c;
                    }
                }
            }
            if (currentCase.waterFlowOut >= 0) {
                let natural = currentCase.neighbors[currentCase.waterFlowOut];
                if (riverHistory.indexOf(natural) == -1) {
                    lowestCase = currentCase.neighbors[currentCase.waterFlowOut];
                }
            }
            if (lowestCase ) {
                riverHistory.push(currentCase);
                if (lowestCase.isBorderSea) {
                    continueRiver = false;
                }
                currentCase = lowestCase;
            } else {
                //currentCase.checkIsHole();
                currentCase.z += 0.01;
                currentCase.calcPoints();
                for (let c of currentCase.neighbors) {
                    if (c) {
                        c.calcPoints();
                        //c.checkIsHole();
                    }
                }
                currentCase = this;
                riverHistory = [];
            }
        }

        riverHistory.push(currentCase);
        for (let i = 0; i < riverHistory.length-1; i++) {
            let from = riverHistory[i];
            let to = riverHistory[i+1];
            let index = from.neighbors.indexOf(to);
            from.waterFlow[index]++;
            from.waterFlowOut = index;
            if (!to.isSea) to.waterFlow[(index+3)%6]++;
        }
    }


}

function getNoise(x, y){
  let dist = Math.sqrt(Math.pow(Math.abs(x-(cols/2)),2) + Math.pow(Math.abs(y-(rows/2)),2));
  dist = Math.max(dist, 0);
  dist = dist / (Math.min(cols, rows)/2);
  dist = 1-dist;
  dist = dist*2;
  dist = Math.max(Math.min(dist,1),0);

  let fx = x/10.0;
  let fy = y/10.0;
  //fx+=2500;
  //fy+=2500;
  let ret = 0;
  ret += perlin.get(fx, fy);
  ret += map(perlin.get(fx*3, fy*3),0,1,-0.3,0.3);
  //ret = pow(ret, 1.2);
  ret *= dist;
  ret = Math.max(ret, zSea);
  return ret;
}

function getAltitude(x, y) {
  if (x>=0 && x < cols && y>=0 && y < rows && cases[x][y]) {
    return cases[x][y].z;
  } else {
    return getNoise(x, y);
  }
}

function map(v, min1, max1, min2, max2) {
    v = (v - min1) / (max1 - min1);
    v *= (max2 - min2);
    v+= min2;
    return v;
}

class Vector {
    __constructor(x, y=0, z=0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

function getCasesData() {
    let ret = {};
    ret.rows = rows;
    ret.cols = cols;
    ret.cases = {}
    for (let x = 0; x < cols; x++) {
        ret.cases[x] = {};
        for (let y = 0; y < rows; y++) {
            let c = {}
            c.x = cases[x][y].x;
            c.y = cases[x][y].y;
            c.z = cases[x][y].z;
            c.points = cases[x][y].points;
            c.waterFlow = cases[x][y].waterFlow;
            c.background = cases[x][y].background;
            ret.cases[x][y] = c;
        }
    }
    return ret;
}









initMap();

// Crée le serveur WebSocket et l'attache au serveur HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connecté');

    // Événement pour la réception de messages du client
    ws.on('message', (message) => {
        console.log('Message reçu:', message);
        // Renvoie le message à tous les clients connectés
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                //client.send(`Serveur a reçu: ${message}`);
            }
        });
    });

    // Événement pour la déconnexion
    ws.on('close', () => {
        console.log('Client déconnecté');
    });

    ws.sendCmd = function(cmd, data) {
        ws.send(JSON.stringify({"cmd":cmd, "data":data}));
    }

    ws.sendCmd("cases", getCasesData());
    // Envoie un message au client lorsqu'il se connecte

});

function sendCmdToAll(cmd, data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.sendCmd(cmd,data);
        }
    });
    
}


// Démarre le serveur HTTP
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT}`);
});

