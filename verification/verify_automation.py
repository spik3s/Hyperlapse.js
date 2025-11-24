from playwright.sync_api import sync_playwright
import time

def verify_automation_grid(page):
    print("Navigating to viewer...")
    page.goto("http://localhost:5173/examples/viewer.html")

    # Wait for the map to ensure JS has started loading/executing
    print("Waiting for map...")
    page.wait_for_selector("#map", timeout=10000)

    # Wait for automation panel to be present in DOM (even if hidden)
    print("Waiting for automation panel...")
    page.wait_for_selector("#automation_panel", state="attached", timeout=10000)

    # Wait a bit for JS initialization (AutomationController creation)
    time.sleep(2)

    print("Showing automation panel...")
    # Force the automation panel to be visible.
    page.evaluate("""() => {
        const panel = document.getElementById('automation_panel');
        panel.style.display = 'block';
    }""")

    # Wait for the canvas to be created and visible
    print("Waiting for canvas...")
    canvas = page.locator("#automation_panel canvas")
    canvas.wait_for(state="visible", timeout=5000)

    # Small delay to ensure render is complete
    time.sleep(1)

    print("Taking screenshot...")
    # Take screenshot of the panel
    page.locator("#automation_panel").screenshot(path="/home/jules/verification/automation_grid.png")
    print("Screenshot saved.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_automation_grid(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
