import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shortestPublicRoute } from "./route_helpers.ts";

Deno.test("finds a path across undirected and directed edges",()=>{
  assertEquals(shortestPublicRoute("a","d",[
    {from_node_id:"a",to_node_id:"b",directed:false},
    {from_node_id:"b",to_node_id:"c",directed:true},
    {from_node_id:"c",to_node_id:"d",directed:false},
  ]),["a","b","c","d"]);
});
Deno.test("does not traverse a directed edge backwards",()=>{
  assertEquals(shortestPublicRoute("b","a",[
    {from_node_id:"a",to_node_id:"b",directed:true},
  ]),null);
});
Deno.test("returns null for disconnected nodes and same-node requests",()=>{
  assertEquals(shortestPublicRoute("a","z",[]),null);
  assertEquals(shortestPublicRoute("a","a",[]),null);
});
Deno.test("rejects routes longer than 32 nodes",()=>{
  const edges=Array.from({length:32},(_,i)=>({
    from_node_id:String(i),to_node_id:String(i+1),directed:true,
  }));
  assertEquals(shortestPublicRoute("0","32",edges),null);
});
