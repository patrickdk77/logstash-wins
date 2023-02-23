const net = require('net');
const socket = new net.Socket();

const Transport = require('winston-transport');
const {format} = require('winston');
const defaultTransform = require('./transform/transform');
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class LogstashTCP extends Transport {

    constructor(opts) {
        super(opts);

        this._port = opts.port || 5000;
        this._host = opts.host || "localhost";
        this._label = opts.label;
        this._maxRetries = opts.maxRetries || 30;
        this._retryInterval = opts.retryInterval || 2000;
        this._idleClose = opts.idleClose || 3000;
        this._keepalive = opts.keepAlive || 30000;
        this._logQueue = [];
        this._transform = opts.transformer || defaultTransform;
        this._connected = false;
        this._silent = false;
        this._currentRetry = 0;
        this._retrying = false;
        if(!opts.idle)
            this.connect();
    }
    
    log(info, callback) {
        setImmediate( () => {
            this.emit('logged', info);   
        });

        if(this._silent){
            callback();    
        }

        if(this._idle)
            clearTimeout(this._idle);
        this._idle=null;
        this._logQueue.push(info);
        this.processLogQueue();
        callback(); 
    }

    sendToLogstash(log){
        let logEntry = this._transform(log, null);
        log.label = this._label;
        logEntry = logEntry.transform(log);
        this._socket.write(JSON.stringify(logEntry) + "\n");
        this.emit('logged', logEntry);
    }

    processLogQueue() {
        if(!this._connected && this._logQueue.length > 0)
            return this.connect();
        if(this._logQueue.length > 0) {
            if(this._idle)
                clearTimeout(this._idle);
            while(this._logQueue.length > 0){
                let log = this._logQueue.shift()
                this.sendToLogstash(log);
            }
        }
        if(this._idle===null)
            this._idle=setTimeout(this.close, this._idleClose, this);
    }
    
    close(that) {
        if(typeof(that)==='undefined' || that===null) {
            that=this;
        }
        if(that._idle)
            clearTimeout(that._idle);
        that._idle=null;
        if(that._interval)
            clearInterval(that._interval);
        that._interval = null;
        that._connected = false;
        that._retrying = false;
        that._currentRetry = 0;
        if(that._socket && (typeof that._socket !== 'undefined')) {
            that._socket.end();
            //that._socket.destroy();
            that._socket=null;
        }
    }
    
    connect() {
        if(this._idle)
            clearTimeout(this._idle);
        this._idle=null;
        if(this._silent || (this._socket && (typeof this._socket !== 'undefined')))
            return;

        this._socket = new net.Socket({
            writable: true,
            readable: false
        });
        this._socket.setDefaultEncoding("utf8");
        this._socket.connect(this._port, this._host, function(){
            socket.setKeepAlive(true, this._keepalive);
        });

        this._socket.on("ready", (conn) => {
            this.processLogQueue();
        })
        
        this._socket.on("connect", () => {
            this._connected = true;
            this._retrying = false;
            this._currentRetry = 0;
            if(this._interval)
                clearInterval(this._interval);
            this._interval = null;
            // wait 60s for socket to be ready
            //setTimeout(()=> {
            //    this.processLogQueue();
            //}, 5000);
        });

        this._socket.on("error", (error) => {
            if(this._idle)
                clearTimeout(this._idle);
            this._idle=null;
            this._connected = false;
            if(this._socket && (typeof this._socket !== 'undefined'))
                this._socket.destroy();
            if(!this._retrying){
                this.retryConnection();
            }   
        })
        
        this._socket.on("drain", (msg) => {
            this.processLogQueue();
        })
        
        this._socket.on("end", (msg) => {
            this._connected = false;
        })
        
        this._socket.on("timeout", (msg) => {
            this._connected = false;
            if(this._idle)
                clearTimeout(this._idle);
            this._idle=null;
            if(this._socket && (typeof this._socket !== 'undefined')) {
                //this._socket.end();
                this._socket.destroy();
                this._socket=null;
            }
            if(!this._retrying){
                this.retryConnection();
            }   
        })

        this._socket.on("close", (msg) => {
            this._connected = false;
            if(this._idle)
                clearTimeout(this._idle);
            this._idle=null;
            if(this._socket && (typeof this._socket !== 'undefined')) {
                //this._socket.end();
                this._socket.destroy();
                this._socket=null;
            }
            if(!this._retrying){
                this.retryConnection();
            }   
        })
    }

    retryConnection() {
        if(this._logQueue.length == 0)
            return this.close();
        this._retrying = true;
        if(!this._interval){
            this._interval = setInterval(() => {
                if(this._socket && (typeof this._socket !== 'undefined')) {
                    if(!this._socket.connecting){
                        this._currentRetry++;
                        this._socket.connect(this._port, this._host);
                    }
                } else {
                    this.connect();
                }
            }, this._retryInterval);
        }
        if(this._currentRetry === this._maxRetries){
            if(this._interval)
                clearInterval(this._interval);
            this._interval=null;
            this._silent = true;
            this.emit('error', new Error('Max retries reached, going silent, further logs will be stored'));
        }
    }
};
