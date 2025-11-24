from playwright.sync_api import sync_playwright

def verify_automation_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the viewer page
        page.goto("http://localhost:5173/examples/viewer.html")

        # Wait for map or UI to load (simplified as we just want to check UI structure)
        page.wait_for_timeout(2000)

        # Check if the controls exist
        controls = page.locator("#controls")

        # Take a screenshot of the initial state
        page.screenshot(path="verification/initial_state.png")

        # Find dat.gui and switch mode to "Automation"
        # Since dat.gui is canvas/DOM based, we might need to find the select element
        # dat.gui usually creates a select for dropdowns.

        # We can also interact via JS to trigger the state change if finding the UI element is hard
        page.evaluate("() => { \
            const controllers = document.querySelector('.dg.main').querySelectorAll('.c select'); \
            /* Assuming the mode controller is one of them. It's the 12th item added to 'parameters' folder? */ \
            /* Let's brute force search for the select that has 'Automation' option */ \
            const selects = document.querySelectorAll('select'); \
            for (let s of selects) { \
                if (s.innerHTML.includes('Automation')) { \
                    s.value = 'Automation'; \
                    s.dispatchEvent(new Event('change')); \
                } \
            } \
        }")

        page.wait_for_timeout(1000)

        # Take a screenshot after switching mode - Automation Panel should be visible
        page.screenshot(path="verification/automation_mode.png")

        browser.close()

if __name__ == "__main__":
    verify_automation_ui()
