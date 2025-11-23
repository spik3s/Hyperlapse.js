from playwright.sync_api import Page, expect, sync_playwright
import time
import os

def verify_markers(page: Page):
    print("Setting up console listener...")
    page.on("console", lambda msg: print(f"Console: {msg.text}"))

    print("Navigating to page...")
    try:
        page.goto("http://localhost:5173/examples/viewer.html", timeout=10000)
    except Exception as e:
        print(f"Navigation error: {e}")

    print("Waiting for 5 seconds...")
    time.sleep(5)

    print("Taking screenshot...")
    try:
        # Use relative path
        page.screenshot(path="verification/markers_verification.png")
        print("Screenshot taken.")
    except Exception as e:
        print(f"Screenshot error: {e}")

if __name__ == "__main__":
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_markers(page)
        finally:
            browser.close()
            print("Browser closed.")
