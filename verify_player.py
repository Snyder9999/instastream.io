from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()

    print("Navigating to home page...")
    # Wait for server to be up (retry)
    for i in range(30):
        try:
            page.goto("http://localhost:3000", timeout=5000)
            break
        except Exception as e:
            print(f"Waiting for server... ({i})")
            time.sleep(2)
    else:
        raise Exception("Server failed to start")

    print("Filling URL...")
    # Fill input with a test video URL
    test_video_url = "https://media.w3.org/2010/05/sintel/trailer.mp4"
    page.fill('input[type="url"]', test_video_url)

    print("Starting stream...")
    # Click Start Streaming
    page.click('button:has-text("Start Streaming")')

    print("Waiting for video...")
    # Wait for video element
    page.wait_for_selector('video', timeout=10000)

    # Wait a bit for playback to start/metadata load
    time.sleep(2)

    print("Hovering to show controls...")
    # Hover over video to show controls (Controls component shows on mouse move)
    # We target the container ref which has onMouseMove
    page.mouse.move(640, 360)
    page.mouse.move(650, 370) # wiggle

    # Wait for controls to appear (transition)
    time.sleep(1)

    # Verify controls are visible
    # Controls container has aria-label="Video controls"
    controls = page.locator('div[aria-label="Video controls"]')
    if controls.is_visible():
        print("Controls are visible!")
    else:
        print("Controls NOT visible!")

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification_controls.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
