export const BASE_CURRENCY = 'USD';

export interface Order{
    price: number;
    quantity: number;
    orderId: string;
    filled: number;
    side: "buy" | "sell";
    userId: string; 
}

export interface Fill{
    price: string;
    otherUserId: string; 
    qty: number;
    tradeId: number;
    marketOrderId: string; 
}

//Orderbook for BASE_ASSET__QUOTE_ASSET 
export class Orderbook{
    bids: Order[];
    asks: Order[];
    bidsMap : Map<string, string>;
    asksMap : Map<string, string>;
    baseAsset: string; 
    quoteAsset: string;
    lastTradeId:number; 
    currentPrice:number; 
    constructor(bids: Order[], asks: Order[],quoteAsset:string,lastTradeId: number, currentPrice: number){
        this.bids = bids;
        this.asks = asks;
        this.baseAsset = BASE_CURRENCY;
        this.quoteAsset = quoteAsset;
        this.lastTradeId = lastTradeId ? lastTradeId : 0;
        this.currentPrice = currentPrice? currentPrice : 0;
        this.bidsMap = new Map<string, string>();
        this.asksMap = new Map<string, string>();
    }
    ticker(){
        return `${this.baseAsset}_${this.quoteAsset}`
    }
    getSnapshot(){
        return {
            bids: this.bids,
            asks: this.asks,
            baseAsset: this.baseAsset,
            quoteAsset: this.quoteAsset,
            lastTradeId: this.lastTradeId,
            currentPrice: this.currentPrice
        }
    }
    addOrder(order: Order):{executedQty: number, fills: Fill[]}{
        if(order.side === "buy"){
            let {executedQty, fills} = this.matchBid(order);
            order.filled = executedQty;
            if(executedQty == order.quantity){
                return {
                    executedQty,
                    fills
                }
            }
            this.bids.push(order);
            const remainingQty = order.quantity - executedQty;
            const currentQty = this.bidsMap.get(order.price.toString()) || '0';
            this.bidsMap.set(order.price.toString(), (BigInt(currentQty) + BigInt(remainingQty)).toString());
            return {
                executedQty,
                fills
            }
        }else{
            let {executedQty, fills} = this.matchAsk(order);
            order.filled = executedQty;
            if(executedQty == order.quantity){
                return {
                    executedQty,
                    fills
                }
            }
            this.asks.push(order);
            const remainingQty = order.quantity - executedQty;
            const currentQty = this.asksMap.get(order.price.toString()) || '0';
            this.asksMap.set(order.price.toString(), (BigInt(currentQty) + BigInt(remainingQty)).toString());
            return {
                executedQty,
                fills
            }
        }
    }

    matchBid(order: Order):{ executedQty: number,fills:Fill[]}{
        const fills: Fill[] = []; 
        let executedQty = 0;
        for(let i=0;i<this.asks.sort.length;i++){
            if(executedQty == order.quantity)break;
            if(this.asks[i].price <= order.price && executedQty < order.quantity){
                const filledQty = Math.min(order.quantity - executedQty, this.asks[i].quantity);
                executedQty += filledQty;
                this.asks[i].filled += filledQty;
                fills.push({
                    price: this.asks[i].price.toString(),
                    otherUserId: this.asks[i].userId,
                    qty: filledQty,
                    tradeId: this.lastTradeId++,
                    marketOrderId: order.orderId
                })
                const currentQty = this.asksMap.get(this.asks[i].price.toString()) || '0';
                const newQty = BigInt(currentQty) - BigInt(filledQty);
                if (newQty > 0) {
                    this.asksMap.set(this.asks[i].price.toString(), newQty.toString());
                } else {
                    this.asksMap.delete(this.asks[i].price.toString());
                }
            }
        }
        this.asks = this.asks.filter(ask => ask.filled < ask.quantity);
        return {
            executedQty,
            fills
        }
    }
    matchAsk(order:Order):{ executedQty: number, fills: Fill[]}{
        const fills: Fill[] = [];
        let executedQty=0;
        //Can be done using a priorityQueue , iterating through the array for now 
        for(let i=0;i<this.bids.sort.length;i++){
            if(executedQty === order.quantity)break;
            if(order.price <= this.bids[i].price && executedQty < order.quantity){
                const amtRemaining = Math.min(order.quantity - executedQty, this.bids[i].quantity);
                executedQty += amtRemaining;
                this.bids[i].filled += amtRemaining;
                fills.push({
                    price: this.bids[i].price.toString(),
                    otherUserId: this.bids[i].userId,
                    qty: amtRemaining,
                    tradeId: this.lastTradeId++,
                    marketOrderId: order.orderId
                })
                const currentQty = this.bidsMap.get(this.bids[i].price.toString()) || '0';
                const newQty = BigInt(currentQty) - BigInt(amtRemaining);
                if (newQty > 0) {
                    this.bidsMap.set(this.bids[i].price.toString(), newQty.toString());
                } else {
                    this.bidsMap.delete(this.bids[i].price.toString());
                }
            }
        }
        this.bids = this.bids.filter(bid => bid.filled < bid.quantity);
        return {executedQty,fills}
    }

    getDepth(){
        const bids: [string,string][] = [];
        const asks: [string,string][] = [];
        for(const [price,qty] of this.bidsMap){
            bids.push([price,qty]);
        }
        for(const [price,qty] of this.asksMap){
            asks.push([price,qty]);
        }
        return {
            bids,asks
        }
    }
    getOpenOrders(userId: string):Order[]{
        const orders: Order[] = []; 
        const asks = this.asks.filter(ask => ask.userId === userId);
        const bids = this.bids.filter(bid => bid.userId === userId);
        orders.push(...asks,...bids);
        return orders;
    }
    cancelBid(order:Order){
        const bid = this.bids.findIndex(bid => bid.orderId === order.orderId);
        if(bid!== -1){
            const price = this.bids[bid].price;
            this.bids.splice(bid,1);
            return price;
        }
    }
    cancelAsk(order:Order){
        const ask = this.asks.findIndex(ask => ask.orderId === order.orderId);
        if(ask!== -1){
            const price = this.asks[ask].price;
            this.asks.splice(ask,1);
            return price;
        }
    }
}