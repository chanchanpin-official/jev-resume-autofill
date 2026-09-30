import json,tempfile,threading,unittest,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from engine import Engine,Catalog,scoped_records
from pipeline import analyze,field_groups,allocate_records
from profile_memory import evidence_digest,save_answer,load_answers
from test_engine import PROFILE,FakeClient

class PipelineTests(unittest.TestCase):
 def test_confirmed_duplicate_reserves_once_without_blocking_other_records(self):
  profile={'honors':{'dated_items':[{'zh':'国家奖学金'},{'zh':'乡村设计一等奖'}]}}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(profile));e=Engine(p,FakeClient())
   e.client.jev=lambda *args:{'0':{'choice':'award_0','confidence':.98},'1':{'choice':'award_0','confidence':.98}}
   fields=[{'id':str(i),'section':'获奖','record_index':i,'record_hint':'国家奖学金' if i<2 else ''} for i in range(3)]
   self.assertEqual([f['record_group'] for f in allocate_records(fields,e,{})],['award_0','','award_1'])
 def test_uncertain_existing_award_only_allows_jev_confirmed_distinct_records(self):
  profile={'honors':{'dated_items':[{'zh':'国家奖学金','date':'2022-12'},
      {'zh':'乡村设计大赛一等奖','date':'2021-12'},{'zh':'挑战杯铜奖','date':'2022-06'}]}}
  for confidence,expected in [(.95,'award_1'),(.89,'')]:
   calls=[]
   class Client(FakeClient):
    def jev(self,state,questions):
     calls.append(state)
     if 'existing_records' in state:
      return {qid:{'choice':'distinct' if 'award_1' in question['instructions'] else 'possible','confidence':confidence}
              for qid,question in questions.items()}
     return {'0':{'choice':'award_0','confidence':.98},'1':{'choice':'none','confidence':.98}}
   with tempfile.TemporaryDirectory() as d:
    p=Path(d)/'profile.json';p.write_text(json.dumps(profile));e=Engine(p,Client())
    saved=[{'section':'获奖','record_index':i,'record_hint':hint} for i,hint in enumerate(['国家奖学金 2022','国家奖学金 2024'])]
    fields=[{'id':'new','section':'获奖','record_index':2,'record_hint':''}]
    planned=allocate_records(fields,e,{},saved)
    self.assertEqual(planned[0]['record_group'],expected)
    self.assertEqual(len(calls),2)
    self.assertEqual(len(calls[1]['existing_records']),2)
 def test_unknown_existing_record_cannot_be_bypassed_without_distinct_evidence(self):
  profile={'experience':[{'company_zh':'One','is_internship':True},{'company_zh':'Two','is_internship':True}]}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(profile));e=Engine(p,FakeClient())
   e.client.jev=lambda *args:{}
   fields=[{'id':'old','section':'实习经历','record_index':0,'record_hint':'某公司'},
           {'id':'new','section':'实习经历','record_index':1,'record_hint':''}]
   self.assertEqual([f['record_group'] for f in allocate_records(fields,e,{})],['',''])
 def test_partial_record_identity_retries_with_exact_dates(self):
  profile={'experience':[{'company_zh':'One','is_internship':True,'start':'2025-06','end':'2025-08','start_exact':'2025-06-01','end_exact':'2025-08-01'},
      {'company_zh':'Two','is_internship':True,'start':'2025-11','end':'2026-05'}]}
  for confidence,expected in [(.97,'experience_0'),(.8,'' )]:
   calls=[]
   class Client(FakeClient):
    def jev(self,state,questions):
     calls.append(state)
     return {'0':{'choice':'experience_0','confidence':confidence if 'profile_record_details' in state else .8}}
   with tempfile.TemporaryDirectory() as d:
    p=Path(d)/'profile.json';p.write_text(json.dumps(profile));e=Engine(p,Client())
    fields=[{'id':'company','section':'实习经历','record_index':0,'record_hint':'开始时间=2025-06-01;结束时间=2025-08-01'}]
    result=allocate_records(fields,e,{})
    self.assertEqual(result[0]['record_group'],expected)
    self.assertEqual(calls[1]['profile_record_details']['experience_0']['start_exact'],'2025-06-01')
 def test_campus_positions_allocate_remaining_leadership_records(self):
  profile={'leadership':[{'org_zh':'学生执行委员会','role_zh':'主席'},{'org_zh':'文体部','role_zh':'部长'},{'org_zh':'学生委员会','role_zh':'委员'}]}
  for title in ['在校职务','校园经历','社团经历','Student leadership']:
   self.assertEqual(scoped_records(profile,title,{}),['leadership_0','leadership_1','leadership_2'])
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(profile));e=Engine(p,FakeClient())
   for index in [1,2]:
    saved=[{'section':'在校职务','record_index':i,'record_hint':profile['leadership'][i]['org_zh']+' '+profile['leadership'][i]['role_zh']} for i in range(index)]
    e.client.jev=lambda state,questions:{str(i):{'choice':'leadership_'+str(i),'confidence':1} for i in range(len(questions))}
    fields=[{'id':'new','section':'在校职务','record_index':index,'record_hint':''}]
    self.assertEqual(allocate_records(fields,e,{},saved)[0]['record_group'],'leadership_'+str(index))
 def test_existing_rows_reserve_records_before_empty_rows(self):
  profile={'experience':[{'company_zh':'One','employment_type_zh':'实习'},{'company_zh':'Two','employment_type_zh':'实习'},{'company_zh':'Three','employment_type_zh':'实习'}]}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(profile));e=Engine(p,FakeClient())
   e.client.jev=lambda *args:{'0':{'choice':'experience_0','confidence':1},'1':{'choice':'experience_2','confidence':1}}
   fields=[{'id':str(i),'section':'实习经历','record_index':i,'record_hint':hint} for i,hint in enumerate(['One','Three',''])]
   planned=allocate_records(fields,e,{})
   self.assertEqual([f['record_group'] for f in planned],['experience_0','experience_2','experience_1'])
   planned=allocate_records([fields[2]],e,{},fields[:2])
   self.assertEqual(planned[0]['record_group'],'experience_1','fully populated rows must also reserve their profile records')
 def test_at_most_three_analysis_workers(self):
  active=0;maximum=0;lock=threading.Lock()
  class Demo:
   def __init__(self,*a,**k):pass
   def decide(self,fields,page,progress,cancelled,emit):
    nonlocal active,maximum
    with lock:active+=1;maximum=max(maximum,active)
    time.sleep(.03)
    with lock:active-=1
    d={'id':fields[0]['id'],'status':'review'};emit(d);return {'decisions':[d]}
  result=analyze([{'id':str(i),'section':str(i),'record_index':0} for i in range(9)],'fixture',.85,.6,{},lambda *a:None,lambda *a:None,lambda:False,Demo)
  self.assertEqual(maximum,3);self.assertEqual(len(result['decisions']),9)
 def test_fast_record_publishes_before_slow_finishes(self):
  entered,release,received=threading.Event(),threading.Event(),threading.Event();rows=[];result=[]
  class DemoEngine:
   def __init__(self,*args,**kw):pass
   def decide(self,fields,page,progress,cancelled,emit):
    f=fields[0]
    if f['id']=='slow':entered.set();release.wait(3)
    else:entered.wait(2)
    d={'id':f['id'],'status':'fill','value':'fixture'}
    if not cancelled():emit(d)
    return {'decisions':[d],'usage':[]}
  def publish(d):
   rows.append(d)
   if d['id']=='fast':received.set()
  fields=[{'id':'slow','section':'Education','record_index':0},{'id':'fast','section':'Internship','record_index':0}]
  t=threading.Thread(target=lambda:result.append(analyze(fields,'fixture',.85,.6,{},publish,lambda *a:None,lambda:False,DemoEngine)));t.start()
  try:
   self.assertTrue(received.wait(2));self.assertTrue(t.is_alive());self.assertEqual([d['id'] for d in rows],['fast'])
  finally:release.set();t.join(3)
  self.assertEqual(len(result[0]['decisions']),2)
 def test_record_consistency_and_internship_fairness(self):
  fields=[{'id':str(i),'section':'Education','record_index':i//10} for i in range(20)]+[{'id':'intern','section':'实习经历','record_index':0}]
  groups=field_groups(fields);self.assertEqual(groups[0][0]['id'],'intern');self.assertTrue(any(len(g)==10 for g in groups));self.assertEqual(sum(map(len,groups)),21)
 def test_profile_employment_types(self):
  p={'experience':[{'title_zh':'游戏产品经理','employment_type_zh':'实习','is_full_time':False},{'title_zh':'Researcher','employment_type_en':'Internship'}]}
  self.assertEqual(scoped_records(p,'实习经历',{}),['experience_0','experience_1']);self.assertEqual(scoped_records(p,'工作经历',{'sections':'工作经历、实习经历'}),[])
 def test_ready_answers_emit_before_generation(self):
  events=[]
  class Client(FakeClient):
   def jev(self,state,questions):
    a=super().jev(state,questions)
    if 'field_0' in a:a['field_0']['confidence']=.1
    return a
   def generate(self,*args):events.append('generate');return super().generate(*args)
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE));Engine(p,Client(narrative=True)).decide([{'id':'slow','label':'Introduction'},{'id':'fast','label':'Introduction'}],{},on_decision=lambda d:events.append(d['id']))
  self.assertEqual(events[:2],['fast','generate'])

class MemoryTests(unittest.TestCase):
 def test_user_invalidated_answer_is_not_loaded_again(self):
  c=Catalog(PROFILE).candidates;ids=['atomic_email']
  item={'text':'demo@example.invalid','field_label':'Contact','section':'Contact','host':'example.invalid','group':'atomic','source_ids':ids,'evidence_digest':evidence_digest(c,ids)}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE))
   save_answer(p,{'status':'fill','_learning':item},c)
   memory=p.with_name('learned-answers.json');data=json.loads(memory.read_text());data['answers'][0]['invalidated']=True;memory.write_text(json.dumps(data))
   self.assertEqual(load_answers(p,c),[])
   self.assertFalse(any(k.startswith('learned_') for k in Engine(p,FakeClient()).catalog.candidates))
 def test_site_narrative_does_not_leak_into_another_employer(self):
  c=Catalog(PROFILE).candidates
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE))
   ids=['atomic_email'];item={'text':'company-specific answer','field_label':'Why this company','section':'Application','host':'company-a.invalid','scope':'site','group':'narratives','source_ids':ids,'evidence_digest':evidence_digest(c,ids)}
   save_answer(p,{'status':'fill','_learning':item},c);e=Engine(p,FakeClient())
   e.decide([],{'host':'company-b.invalid'})
   self.assertFalse(any(k.startswith('learned_') for k in e.catalog.candidates))
 def test_verified_saved_once_and_invalidated_by_source_changes(self):
  c=Catalog(PROFILE).candidates;ids=['atomic_email'];item={'text':'demo@example.invalid','field_label':'Email','section':'Contact','host':'example.invalid','group':'atomic','source_ids':ids,'evidence_digest':evidence_digest(c,ids)}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'profile.json';p.write_text(json.dumps(PROFILE));decision={'status':'fill','_learning':item}
   self.assertFalse(save_answer(p,{'status':'review'},c)['saved']);self.assertTrue(save_answer(p,decision,c)['saved']);self.assertTrue(save_answer(p,decision,c)['duplicate']);self.assertEqual(len(load_answers(p,c)),1)
   self.assertEqual(p.with_name('learned-answers.json').stat().st_mode&0o777,0o600)
   e=Engine(p,FakeClient());self.assertTrue(any(k.startswith('learned_') for k in e.catalog.candidates))
   c['atomic_email']['value']='changed@example.invalid';self.assertEqual(load_answers(p,c),[]);self.assertFalse(save_answer(p,decision,c)['saved'])

if __name__=='__main__':unittest.main()
