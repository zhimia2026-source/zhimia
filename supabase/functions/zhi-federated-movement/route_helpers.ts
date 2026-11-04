export type RouteEdge = {
  from_node_id: string;
  to_node_id: string;
  directed: boolean;
};

export function shortestPublicRoute(start:string,target:string,edges:RouteEdge[]):string[]|null {
  if(!start||!target||start===target) return null;
  const graph=new Map<string,string[]>();
  for(const edge of edges){
    if(!graph.has(edge.from_node_id)) graph.set(edge.from_node_id,[]);
    graph.get(edge.from_node_id)!.push(edge.to_node_id);
    if(!edge.directed){
      if(!graph.has(edge.to_node_id)) graph.set(edge.to_node_id,[]);
      graph.get(edge.to_node_id)!.push(edge.from_node_id);
    }
  }
  const queue=[start], previous=new Map<string,string|null>([[start,null]]);
  for(let i=0;i<queue.length;i++){
    const node=queue[i];
    if(node===target) break;
    for(const next of graph.get(node)??[]){
      if(previous.has(next)) continue;
      previous.set(next,node);
      queue.push(next);
    }
  }
  if(!previous.has(target)) return null;
  const path:string[]=[];
  let cursor:string|null=target;
  while(cursor!==null){path.push(cursor);cursor=previous.get(cursor)??null;}
  path.reverse();
  return path.length>=2&&path.length<=32?path:null;
}
