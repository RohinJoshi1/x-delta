import {createClient,RedisClientType} from "redis"
import { MessageFromOrderbook } from "./types"
import { MessageToEngine } from "./types/types"
import {v4 as uuidv4} from 'uuid';

export class RedisManager{
    private client: RedisClientType;
    private publisher: RedisClientType;
    private static instance: RedisManager 
    private constructor(){
        this.client = createClient() 
        this.client.connect()
        this.publisher = createClient() 
        this.publisher.connect() 
    }
    public static getInstance(): RedisManager{
        if(!RedisManager.instance){
            RedisManager.instance = new RedisManager()
        }
        return RedisManager.instance
    }
    // SendAndAwait will basically push to queue, and subscribe to the ticker channel
    public sendAndAwait(message: MessageToEngine): Promise<MessageFromOrderbook>{
        return new Promise((resolve)=>{
            const id = uuidv4()
            this.client.subscribe(id,(message)=>{
                this.client.unsubscribe(id)
                resolve(JSON.parse(message))
            })
            this.publisher.lPush("messages",JSON.stringify({clientId: id, message}))
        })
    }
  
}