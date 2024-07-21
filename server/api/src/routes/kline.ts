import {Client} from "pg"
import { RedisManager } from "../Redis"
import {Router} from "express"

const pgclient = new Client({
    user: "postgres",
    host: "localhost",
    database: "postgres",
    password: "1234",
    port: 5432,
})

pgclient.connect()

export const kLineRouter = Router()  
kLineRouter.get("/", async (req, res) => {
    const {market, startTime, endTime, interval} = req.query; 
    let query; 
    switch (interval) {
        case '1m':
            query = `SELECT * FROM klines_1m WHERE bucket >= $1 AND bucket <= $2`;
            break;
        case '1h':
            query = `SELECT * FROM klines_1m WHERE  bucket >= $1 AND bucket <= $2`;
            break;
        case '1w':
            query = `SELECT * FROM klines_1w WHERE bucket >= $1 AND bucket <= $2`;
            break;
        default:
            return res.status(400).send('Invalid interval');
    }

    try{
         //@ts-ignore
         const result = await pgClient.query(query, [new Date(startTime * 1000 as string), new Date(endTime * 1000 as string)]);
         res.json(result.rows.map(x => ({
             close: x.close,
             end: x.bucket,
             high: x.high,
             low: x.low,
             open: x.open,
             quoteVolume: x.quoteVolume,
             start: x.start,
             trades: x.trades,
             volume: x.volume,
         })));
     } catch (err) {
         console.log(err);
         res.status(500).send(err);
    }
})
