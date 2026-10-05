"""Create/refresh one user's Academy Playwright storage state via manual login."""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from worker.browser import browser_session
from worker.auth import ensure_login

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--user-id', type=int, required=True, help='local RoV Academy Web user id')
    args=parser.parse_args()
    try:
        print(f'เปิด Chromium สำหรับ user_id={args.user_id}; กรุณาล็อกอินภายในเวลาที่กำหนด')
        with browser_session(headless=False, user_id=args.user_id, use_state=False) as (context,page):
            ensure_login(page, context, args.user_id, force=True)
        print('บันทึก Academy session สำเร็จ')
    except Exception as error:
        sys.exit(f'ล็อกอินไม่สำเร็จ ({type(error).__name__}): ตรวจ display, URL/selector และค่าตั้งค่า Academy')
if __name__ == '__main__': main()
