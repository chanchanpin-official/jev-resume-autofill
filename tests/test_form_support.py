import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'bridge'))
from form_support import get_support, complete_correction
class FormSupportTests(unittest.TestCase):
 def test_correction_is_canonical_scoped_and_consumed_only_explicitly(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'profile').mkdir();p=root/'profile/profile.json'
   data={'date_conventions':{'month_only_default_day':1},'education':[{'id':'edu','school_zh':'School A','start':'2020-09'}],'authorized_form_corrections':[{'id':'one','host':'xyz.51job.com','from':'2024-09-01','to':'2020-09-01','source':'education[0].start','record_id':'edu','field':'本科入学日期','status':'pending','authorization':'User explicitly approved this correction'}]}
   p.write_text(json.dumps(data));support=get_support(p);self.assertEqual(support['corrections'][0]['identity'],'School A')
   data['authorized_form_corrections'][0]['to']='2019-09-01';p.write_text(json.dumps(data));self.assertEqual(get_support(p)['corrections'],[])
   self.assertFalse(complete_correction(p,'one')['saved'])
   data['authorized_form_corrections'][0]['to']='2020-09-01';p.write_text(json.dumps(data));self.assertTrue(complete_correction(p,'one')['saved']);self.assertEqual(get_support(p)['corrections'],[])
 def test_support_never_exposes_attachment_downloads(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'profile').mkdir();(root/'ok.pdf').write_bytes(b'test pdf fixture');p=root/'profile/profile.json'
   p.write_text(json.dumps({'resume_files':{'latest_cn_pdf':'ok.pdf','latest_en_pdf':'../secret.pdf'}}))
   self.assertEqual(get_support(p)['attachments'],[])
   self.assertEqual(get_support(p)['upload_mode'],'manual')
