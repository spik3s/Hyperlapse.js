import os
from playwright.sync_api import sync_playwright, expect

def verify_viewer_controls():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        page.goto("http://localhost:5174/examples/viewer.html")

        # Handle the alert about API key
        page.on("dialog", lambda dialog: dialog.accept())

        try:
            page.wait_for_selector(".dg.main", timeout=5000)
            print("dat.gui loaded")
        except:
            print("dat.gui did not load")

        page.screenshot(path="verification/viewer_controls_updated.png")

        content = page.content()
        # Check for all controls: radius, google_only, preference
        controls = ["radius", "google_only", "preference"]
        found_all = True
        for c in controls:
            if c in content:
                 print(f"Found {c} control")
            else:
                 print(f"Missing {c} control")
                 found_all = False

        browser.close()

if __name__ == "__main__":
    verify_viewer_controls()
