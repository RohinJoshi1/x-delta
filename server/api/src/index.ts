import express from "express";
import cors from "cors"
import {orderRouter,kLineRouter,tradesRouter,depthRouter,tickersRouter} from "./routes/index";

const app = express()
const router = express.Router() 
app.use(cors())
app.use(express.json())


app.use("/api/v1/order",orderRouter)
app.use("/api/v1/klines",kLineRouter)
app.use("/api/v1/trades",tradesRouter)
app.use("/api/v1/depth",depthRouter)
app.use("/api/v1/tickers",tickersRouter)

app.listen(3000, ()=>{
    console.log("server is running on port 3000")
})
