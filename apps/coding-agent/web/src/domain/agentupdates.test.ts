import { expect, it } from "vitest";
import { patchCompaction } from "./agentupdates";
it("upserts by id in first-seen order and implements omission, null and replacement", () => {
 let rows = patchCompaction([], {compactionId:"a",seq:10,turnId:"t",content:{type:"text",text:"first"}});
 rows = patchCompaction(rows,{compactionId:"b",status:"in_progress"});
 rows = patchCompaction(rows,{compactionId:"a",status:"failed",error:"temporary",_meta:{x:1}});
 expect(rows[0].summary).toEqual([{type:"text",text:"first"}]);
 rows = patchCompaction(rows,{compactionId:"a",status:"completed",error:null,_meta:null,summary:[{type:"text",text:"replacement"}]});
 expect(rows[0].firstSequence).toBe(10);expect(rows[0].turnId).toBe("t");expect(rows.map(r=>r.id)).toEqual(["a","b"]);expect(rows[0].error).toBeNull();expect(rows[0].meta).toBeNull();
 expect(rows[0].summary).toEqual([{type:"text",text:"replacement"}]);
 expect(patchCompaction(rows,{compactionId:"a",summary:[]})[0].summary).toEqual([]);
 expect(patchCompaction(rows,{compactionId:"a",summary:null})[0].summary).toEqual([]);
});
it("bounds summaries and entities without changing existing transcripts", () => {
 let rows = patchCompaction([],{compactionId:"a",content:{type:"text",text:"x".repeat(70000)}});
 expect(rows[0].truncated).toBe(true);expect(rows[0].summary).toEqual([]);
 for(let i=0;i<100;i++)rows=patchCompaction(rows,{compactionId:String(i),status:"completed"});
 expect(rows).toHaveLength(20);
 expect(patchCompaction(rows,{status:"completed"})).toBe(rows);
});

it("chunk metadata does not overwrite the compaction entity metadata", () => {
 let rows=patchCompaction([],{compactionId:"a",status:"in_progress",_meta:{scope:"entity"}});
 rows=patchCompaction(rows,{compactionId:"a",content:{type:"text",text:"chunk"},_meta:{scope:"chunk"}});
 expect(rows[0].meta).toEqual({scope:"entity"});
});

it("accepts server session.compacted payloads with string summary and idempotent replay (E11, E12)", () => {
 const ev = {
  compactionId: "cmp_server_1",
  status: "completed",
  seq: 42,
  kept: ["t1", "t8"],
  summarised: ["t2", "t3", "t4"],
  tokensBefore: 18000,
  tokensAfter: 6000,
  summary: "Summarised 3 middle turns (18,000 -> 6,000 tokens).",
 };
 let rows = patchCompaction([], ev);
 expect(rows).toHaveLength(1);
 expect(rows[0].id).toBe("cmp_server_1");
 expect(rows[0].status).toBe("completed");
 expect(rows[0].summary).toEqual([{ type: "text", text: ev.summary }]);
 // Replaying the exact same SSE event does not duplicate rows
 rows = patchCompaction(rows, ev);
 expect(rows).toHaveLength(1);
});
