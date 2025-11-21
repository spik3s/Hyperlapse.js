from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Navigate to the local server
        page.goto("http://localhost:5173/examples/simple.html")

        # Wait a bit for things to load (Three.js canvas, etc)
        # Since we don't have a valid API key, we expect an alert or error in console,
        # but the Three.js canvas should be present if initialized.
        # Hyperlapse.js tries to init Three.js immediately.

        # Check if canvas exists
        page.wait_for_selector("canvas", timeout=5000)

        # Take screenshot
        page.screenshot(path="verification/simple_example.png")
        browser.close()

if __name__ == "__main__":
    run()
