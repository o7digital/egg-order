// Catalogue validation is deterministic. HF output is advisory and never authorizes an import.
export async function anomalies(headers,rows) {
 const index=headers.findIndex(h=>/^(sku|item\s*(number|code|id)?|product\s*(code|id)?|itemnumber)$/i.test(h.trim()));
 const alerts=[];
 if(process.env.ARTIMEX_PRODUCT_CATALOG) {
  const catalogue=JSON.parse(process.env.ARTIMEX_PRODUCT_CATALOG);
  if(!Array.isArray(catalogue)||!catalogue.every(v=>typeof v==='string')) throw Error('Product catalogue configuration is invalid.');
  if(index<0) alerts.push({code:'PRODUCT_COLUMN_MISSING',severity:'error',message:'Product identifier column not found. Contact Artimex.'});
  else {const known=new Set(catalogue);for(const [i,row] of rows.entries()) if(!known.has(row[index].trim())) alerts.push({code:'UNKNOWN_PRODUCT',severity:'error',row:i+2,product:row[index].slice(0,100),message:'Product not found in the official catalogue.'});}
 } else alerts.push({code:'CATALOGUE_NOT_CONFIGURED',severity:'warning',message:'Product existence has not been checked: official catalogue missing.'});
 if(process.env.HF_TOKEN && process.env.HF_MODEL) {
  try {
   // Send numeric aggregates only, never CSV cells, account emails or business identifiers.
   const stats={rows:rows.length,columns:headers.length,emptyCells:rows.reduce((n,r)=>n+r.filter(c=>!c.trim()).length,0),negativeNumbers:rows.reduce((n,r)=>n+r.filter(c=>/^\s*-\d+(\.\d+)?\s*$/.test(c)).length,0)};
   const response=await fetch('https://router.huggingface.co/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.HF_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.HF_MODEL,messages:[{role:'system',content:'Review aggregate CSV statistics for possible data quality issues. Give a short advisory comment. Never claim to validate products or imports.'},{role:'user',content:JSON.stringify(stats)}],max_tokens:160}),signal:AbortSignal.timeout(8000)});
   if(!response.ok) throw Error('Unavailable');const result=await response.json();
   alerts.push({code:'HF_ADVISORY',severity:'info',message:String(result.choices?.[0]?.message?.content||'No advisory returned.').slice(0,2000)});
  } catch { alerts.push({code:'HF_UNAVAILABLE',severity:'warning',message:'Hugging Face analysis unavailable; manual review required.'}); }
 }
 return alerts;
}
