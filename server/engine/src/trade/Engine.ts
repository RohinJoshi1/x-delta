import fs from "fs"
import { RedisManager } from "../RedisManager"
import { ORDER_UPDATE, TRADE_ADDED } from "../types/index";
import { CANCEL_ORDER, CREATE_ORDER, GET_DEPTH, GET_OPEN_ORDERS, MessageFromApi, ON_RAMP } from "../types/fromApi";
import { Fill, Order, Orderbook,BASE_CURRENCY } from "./orderbook";


interface UserBalance{
    [key:string]:{
        available:number;
        locked:number;
    }
}
export class Engine{
    private orderbooks: Orderbook[] = []; 
    private balances: Map<string,UserBalance> = new Map();

    constructor(){
        let snapshot = null;
        try {
            if (process.env.WITH_SNAPSHOT) {
                snapshot = fs.readFileSync("./snapshot.json");
            }
        } catch (e) {
            console.log("No snapshot found");
        }

        if (snapshot) {
            const snapshotSnapshot = JSON.parse(snapshot.toString());
            this.orderbooks = snapshotSnapshot.orderbooks.map((o: any) => new Orderbook(o.baseAsset, o.bids, o.asks, o.lastTradeId, o.currentPrice));
            this.balances = new Map(snapshotSnapshot.balances);
        } else {
            this.orderbooks = [new Orderbook([], [],'USDT', 0, 0)];
            this.setBaseBalances();
        }
        setInterval(() => {
            this.saveSnapshot();
        }, 1000 * 3);
    }
    saveSnapshot(){
        const snapshots = {
            orderbooks: this.orderbooks.map((o)=>{
                o.getSnapshot();
            }),
            balances: Array.from(this.balances.entries()),
        }
        fs.writeFileSync("./snapshot.json", JSON.stringify(snapshots));
    }
    process(message: MessageFromApi,clientId:string){
        switch (message.type) {
            case CREATE_ORDER:
                try {
                    const {executedQty, fills, orderId} = this.createOrder(message.data.market, Number(message.data.price), Number(message.data.quantity), message.data.side, message.data.userId);
                    RedisManager.getInstance().sendToApi(clientId,{
                        type: "ORDER_PLACED",
                        payload:{
                            orderId, 
                            executedQty, 
                            fills
                        }
                    })
                } catch (error) {
                    RedisManager.getInstance().sendToApi(clientId,{
                        type:"ORDER_CANCELLED",
                        payload:{
                            orderId:"",
                            executedQty:0,
                            remainingQty:0,
                        }
                    })
                    };
                    break;
            default:
                console.log("Unknown message type");
                break;
                }
              
            // case CANCEL_ORDER:
            //     this.cancelOrder(message,clientId);
            //     break;
            // case GET_OPEN_ORDERS:
            //     this.getOpenOrders(message,clientId);
            //     break;
            // case GET_DEPTH:
            //     this.getDepth(message,clientId);
            //     break;
            // case ON_RAMP:
            //     this.onRamp(message,clientId);
            //     break;
            
        }
    addOrderBook(orderbook: Orderbook){
        this.orderbooks.push(orderbook);
    }
    createOrder(market: string, price: number, quantity: number, side: "buy" | "sell", userId: string): { executedQty: number, fills: Fill[], orderId: string } {
        const orderbook = this.orderbooks.find((o)=> o.ticker() === market);
        if(!orderbook){
            throw new Error("Orderbook not found");
        }
        const quoteAsset = market.split("_")[1];
        const baseAsset = market.split("_")[0];
        this.checkAndLockFunds(baseAsset,quoteAsset,side,userId,price.toString(),quantity.toString());
        const order: Order = {
            price: Number(price),
            quantity: Number(quantity),
            orderId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            filled: 0,
            side,
            userId
        }
        
        const { fills, executedQty } = orderbook.addOrder(order);
        this.updateBalance(userId, baseAsset, quoteAsset, side, fills, executedQty);
        return { executedQty, fills, orderId: order.orderId };


    }
    checkAndLockFunds(baseAsset: string, quoteAsset: string, side: "buy" | "sell", userId: string,price: string, quantity: string) {
        if(side=="buy"){
            if((this.balances.get(userId)?.[quoteAsset]?.available || 0) < Number(quantity)*Number(price)){
                throw new Error("Insufficient funds");
            }
            //@ts-ignore
            this.balances.get(userId)?.[quoteAsset]?.available -= Number(quantity)*Number(price);
            //@ts-ignore
            this.balances.get(userId)?.[quoteAsset]?.locked -= Number(quantity)*Number(price);
    }else{
        if ((this.balances.get(userId)?.[baseAsset]?.available || 0) < Number(quantity)) {
            throw new Error("Insufficient funds");
        }
        //@ts-ignore
        this.balances.get(userId)[baseAsset].available = this.balances.get(userId)?.[baseAsset].available - (Number(quantity));
        
        //@ts-ignore
        this.balances.get(userId)[baseAsset].locked = this.balances.get(userId)?.[baseAsset].locked + Number(quantity);
    }
}
updateBalance(userId: string, baseAsset: string, quoteAsset: string, side: "buy" | "sell", fills: Fill[], executedQty: number) {
    if (side === "buy") {
        fills.forEach(fill => {
            // Update quote asset balance
            //@ts-ignore
            this.balances.get(fill.otherUserId)[quoteAsset].available = this.balances.get(fill.otherUserId)?.[quoteAsset].available + (fill.qty * fill.price);

            //@ts-ignore
            this.balances.get(userId)[quoteAsset].locked = this.balances.get(userId)?.[quoteAsset].locked - (fill.qty * fill.price);

            // Update base asset balance

            //@ts-ignore
            this.balances.get(fill.otherUserId)[baseAsset].locked = this.balances.get(fill.otherUserId)?.[baseAsset].locked - fill.qty;

            //@ts-ignore
            this.balances.get(userId)[baseAsset].available = this.balances.get(userId)?.[baseAsset].available + fill.qty;

        });
        
    } else {
        fills.forEach(fill => {
            // Update quote asset balance
            //@ts-ignore
            this.balances.get(fill.otherUserId)[quoteAsset].locked = this.balances.get(fill.otherUserId)?.[quoteAsset].locked - (fill.qty * fill.price);

            //@ts-ignore
            this.balances.get(userId)[quoteAsset].available = this.balances.get(userId)?.[quoteAsset].available + (fill.qty * fill.price);

            // Update base asset balance

            //@ts-ignore
            this.balances.get(fill.otherUserId)[baseAsset].available = this.balances.get(fill.otherUserId)?.[baseAsset].available + fill.qty;

            //@ts-ignore
            this.balances.get(userId)[baseAsset].locked = this.balances.get(userId)?.[baseAsset].locked - (fill.qty);

        });
    }
}
createDbTrades(fills: Fill[], market: string, userId: string) {
    fills.forEach(fill => {
        RedisManager.getInstance().pushMessage({
            type: TRADE_ADDED,
            data: {
                market: market,
                id: fill.tradeId.toString(),
                isBuyerMaker: fill.otherUserId === userId, // TODO: Is this right?
                price: fill.price,
                quantity: fill.qty.toString(),
                quoteQuantity: (fill.qty * Number(fill.price)).toString(),
                timestamp: Date.now()
            }
        });
    });
}

publishWsTrades(fills: Fill[], userId: string, market: string) {
    fills.forEach(fill => {
        RedisManager.getInstance().publishMessage(`trade@${market}`, {
            stream: `trade@${market}`,
            data: {
                e: "trade",
                t: fill.tradeId,
                m: fill.otherUserId === userId,
                p: fill.price,
                q: fill.qty.toString(),
                s: market,
            }
        });
    });
}

sendUpdatedDepthAt(price: string, market: string) {
    const orderbook = this.orderbooks.find(o => o.ticker() === market);
    if (!orderbook) {
        return;
    }
    const depth = orderbook.getDepth();
    const updatedBids = depth?.bids.filter(x => x[0] === price);
    const updatedAsks = depth?.asks.filter(x => x[0] === price);
    
    RedisManager.getInstance().publishMessage(`depth@${market}`, {
        stream: `depth@${market}`,
        data: {
            a: updatedAsks.length ? updatedAsks : [[price, "0"]],
            b: updatedBids.length ? updatedBids : [[price, "0"]],
            e: "depth"
        }
    });
}
 
    setBaseBalances() {
        this.balances.set("1", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0
            },
            "USDT": {
                available: 10000000,
                locked: 0
            }
        });

        this.balances.set("2", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0
            },
            "USDT": {
                available: 10000000,
                locked: 0
            }
        });

        this.balances.set("5", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0
            },
            "USDT": {
                available: 10000000,
                locked: 0
            }
        });
    }

}


