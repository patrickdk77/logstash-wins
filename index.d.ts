/// <reference types="node" />

import * as stream from 'stream';
import * as logform from 'logform';
import TransportStream from 'winston-transport';

declare class LogstashTCP extends TransportStream {

  constructor(opts?: LogstashTCP.LogstashTCPOptions);

  public log?(info: any, next: () => void): any;
  public close?(): void;
}

declare namespace LogstashTCP {
  interface LogstashTCPOptions {
    port?: Number;
    host?: string;
    label?: string;
    maxRetries?: Number;
    retryInterval?: Number;
    idleClose?: Number;
    keepalive?: Number;
    transformer?: function;
    json?: boolean;
    idle?: boolean;
    

    log?(info: any, next: () => void): any;
    close?(): void;
  }
}

export = LogstashTCP;

