'use strict';
const EventEmitter=require('events');
class LiveRelay extends EventEmitter{constructor(){super();this.cache=new Map();this.ws=null;this.timer=null;}set(symbol,quote){this.cache.set(symbol,quote);this.emit('quote',quote);}get(symbol){return this.cache.get(symbol)||null;}getAll(){return[...this.cache.values()];}stop(){if(this.timer)clearInterval(this.timer);if(this.ws?.close)this.ws.close();this.ws=null;this.timer=null;}}
module.exports={LiveRelay};
