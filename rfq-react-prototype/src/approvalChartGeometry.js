const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

export function buildApprovalLineGeometry(data,{width=760,height=240}={}){
 const plot={left:48,right:width-24,top:24,bottom:height-40};
 const maximum=Math.max(0,...data.flatMap(point=>[point.averageHours,point.previousAverageHours]).filter(valid));
 const rough=maximum/4,power=rough>0?10**Math.floor(Math.log10(rough)):1;
 const step=rough>0?[1,2,2.5,5,10].find(value=>value*power>=rough)*power:1;
 const maxValue=step*4,y=value=>valid(value)?plot.bottom-value/maxValue*(plot.bottom-plot.top):null;
 const points=data.map((point,index)=>({index,x:plot.left+(data.length>1?index/(data.length-1):0.5)*(plot.right-plot.left),currentY:y(point.averageHours),previousY:y(point.previousAverageHours)}));
 const segments=field=>{
  const result=[];let current=[];
  for(const point of points){if(point[field]===null){if(current.length)result.push(current);current=[];}else current.push({x:point.x,y:point[field]});}
  if(current.length)result.push(current);return result;
 };
 return {width,height,plot,maxValue,points,series:{current:segments('currentY'),previous:segments('previousY')},
  ticks:Array.from({length:5},(_,index)=>({value:step*index,y:y(step*index)}))};
}
