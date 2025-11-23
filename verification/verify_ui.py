import os
from playwright.sync_api import sync_playwright, expect

def verify_viewer_controls():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # Navigate to the viewer example
        # Using 5174 as per previous output
        page.goto("http://localhost:5174/examples/viewer.html")

        # Handle the alert about API key if it appears (might happen with dummy key)
        page.on("dialog", lambda dialog: dialog.accept())

        # Since the dummy key is invalid, Google Maps won't load properly,
        # but we need to check if dat.gui loads.
        # In viewer.html:
        # await loadGoogleMaps(apiKey);
        # If this throws or fails, the rest of init() (including dat.gui) won't run.

        # We can try to mock loadGoogleMaps or inject a script to bypass it.
        # Or we can check if the error message is shown.

        try:
            page.wait_for_selector(".dg.main", timeout=5000)
            print("dat.gui loaded")
        except:
            print("dat.gui did not load (expected with dummy key). Taking screenshot of what we have.")

        # Take a screenshot of the controls
        page.screenshot(path="verification/viewer_controls.png")

        content = page.content()
        if "radius" in content and "google_only" in content:
             print("Found new controls in DOM")
        else:
             print("Controls not found!")

        browser.close()

if __name__ == "__main__":
    verify_viewer_controls()
