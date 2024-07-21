import { Ticker,Depth,KLine,Trade} from "./types";
import axios from "axios"; 
const baseUrl = "https://localhost:3000/api/v1";

export async function getTickers(): Promise<Ticker[]>{
    const response = await axios.get(`${baseUrl}/tickers`);
    return response.data;
}
export async function getTicker(market:string): Promise<Ticker>{
    const tickers = await getTickers(); 
    const ticker = tickers.find((t)=> t.symbol === market)
    if(!ticker){
        throw new Error("Ticker not found");
    }
    return ticker;
}
export async function getDepth(market:string): Promise<Depth>{
    const response = await axios.get(`${baseUrl}/depth?symbol=${market}`);
    return response.data;
}

export async function getKlines(market: string, interval: string, startTime: number, endTime: number): Promise<KLine[]> {
    const response = await axios.get(`${baseUrl}/klines?symbol=${market}&interval=${interval}&startTime=${startTime}&endTime=${endTime}`);
    const data: KLine[] = response.data;
    return data.sort((x, y) => (Number(x.end) < Number(y.end) ? -1 : 1));
}
export async function getTrades(market:string,limit:number): Promise<Trade[]>{
    const response = await axios.get(`${baseUrl}/trades?symbol=${market}`);
    return response.data;
}