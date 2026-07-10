---
name: exploratory-test
description: Run AI-driven exploratory testing sessions on the mobile app using Maestro + Android emulators. Claude views screenshots, decides actions, and journals all findings.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# AI-Driven Exploratory Mobile Testing

Run exploratory testing sessions on the Retainit/TurboCharge React Native app. You interact with the app via Maestro (UI automation) and adb (screenshots), view each screen as an image, decide what to do next, and journal everything.

## Prerequisites Check

Before starting, verify the environment:

```bash
adb devices          # At least one emulator listed as "device"
maestro --version    # Maestro CLI installed
magick --version     # ImageMagick for screenshot resizing
mongosh --version    # MongoDB shell for user provisioning
```

### Dev Server

The backend dev server must be running for the app to function. Start it before testing:

```bash
cd backend && yarn dev   # Runs on port 3001
```

The emulator connects to the dev server via `adb reverse tcp:3001 tcp:3001` (set up during emulator start).

### Building the App

If testing changes from a new branch or after code modifications, you'll need to build and install a fresh APK:

```bash
cd frontend/mobile/android && ./gradlew assembleDevDebug
# Then install:
adb install -r frontend/mobile/android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

Building a new APK is always an option if the installed app seems stale or you want to test recent changes. You can also use `npx react-native run-android --variant=devDebug` for a build+install+launch in one step.

### Available AVDs

| AVD Name              | Screen Size | Resolution |
|----------------------|-------------|------------|
| Pixel_4a_API_33      | 5.8"        | 1080x2340  |
| Medium_Phone_API_35  | 6.4"        | 1080x2400  |
| Small_Phone_API_35   | 4.7"        | 720x1280   |

### Starting an Emulator

```bash
emulator -avd Pixel_4a_API_33 -no-audio -no-window -no-boot-anim &
# Wait for boot
adb wait-for-device
adb shell getprop sys.boot_completed  # Returns "1" when ready
# Set up reverse port forwarding for backend
adb reverse tcp:3001 tcp:3001
```

For multiple emulators:
```bash
emulator -avd Pixel_4a_API_33 -no-audio -no-window -no-boot-anim &
sleep 2
emulator -avd Medium_Phone_API_35 -no-audio -no-window -no-boot-anim &
# Check mapping: adb devices shows emulator-5554, emulator-5556, etc.
```

### Installing the App

```bash
adb install frontend/mobile/android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
# Or for a specific device:
adb -s emulator-5554 install frontend/mobile/android/app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

## The Testing Loop

Repeat this cycle for every interaction:

### 1. Run a Maestro Step

Send YAML steps to Maestro via a temp file:

```bash
TMPFILE=$(mktemp /tmp/maestro-stdin-XXXXXX.yaml)
trap "rm -f '$TMPFILE'" EXIT
cat > "$TMPFILE" <<'YAML'
appId: app.retainit.dev.app
---
- tapOn: "Continue"
YAML
maestro test "$TMPFILE" 2>&1
rm -f "$TMPFILE"
```

For a specific emulator:
```bash
maestro test --udid=emulator-5554 "$TMPFILE" 2>&1
```

### 2. Take a Screenshot

```bash
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png /tmp/screen_raw.png
magick /tmp/screen_raw.png -resize 400x870 /tmp/screen01.png
```

For a specific device:
```bash
adb -s emulator-5554 shell screencap -p /sdcard/screen.png
adb -s emulator-5554 pull /sdcard/screen.png /tmp/screen_raw.png
magick /tmp/screen_raw.png -resize 400x870 /tmp/screen01.png
```

### 3. View the Screenshot

Use the Read tool on the PNG file. Claude is multimodal and can see images.

### 4. Decide Next Action

Based on what you see on screen, choose the next interaction. Journal your observations before acting.

### 5. Repeat

Continue the loop until you've explored the target flow or area.

## Interaction Techniques (Preferred Order)

| Technique | Example | Reliability | When to Use |
|-----------|---------|-------------|-------------|
| `tapOn: id: "testID"` | `tapOn: id: "BottomBar_homeTab"` | High | When testIDs exist in source |
| `tapOn: text: "Button Text"` | `tapOn: "Continue"` | Medium | For visible button/link text |
| `tapOn: text: ".*regex.*"` | `tapOn: text: ".*Remembering more.*"` | Medium | For emoji-prefixed or dynamic text |
| `inputText: "..."` | `inputText: "test"` | High | Text entry fields |
| `pressKey: back` | `pressKey: back` | High | Android back button |
| `tapOn: point: "50%,50%"` | `tapOn: point: "10%,20%"` | Low | Last resort only |

**Key lesson:** Coordinate-based taps are unreliable on emulators. Always prefer testIDs or text matching.

### Combining Multiple Steps

```yaml
- tapOn: "Type password here"
- inputText: "test"
- tapOn: "Continue"
```

## Known testIDs

| testID | Element |
|--------|---------|
| `BottomBar_homeTab` | Home tab in bottom nav |
| `BottomBar_libraryTab` | Library tab |
| `BottomBar_searchTab` | Search tab |
| `BottomBar_badgeTab` | Feed/Badge tab |
| `BottomBar_profileTab` | Profile tab |
| `ImportPage_addExpansionPackButton` | "+" FAB on Search tab |
| `consumption-frequency-option-{id}` | Onboarding frequency options (almost-all, most, some, occasional) |

To discover more testIDs, search the codebase:
```
Grep for testID in frontend/mobile/src/
```

## Manual Interventions

Some steps can't be fully automated:

### 1. Alpha Access Code
The password is `test`.

### 2. Phone Verification
The emulator can't receive SMS. Use a Firebase test phone number that auto-verifies:
- Set in Firebase Console as a test number with verification code `000000`
- Or change the user's phone in MongoDB to `+440000000000` (a test number)

### 3. User Approval
After signup, the user needs admin approval:
```bash
mongosh "mongodb+srv://abzorb.kyfml.mongodb.net/dev" --eval "
  db.users.updateOne(
    { phone: '+440000000000' },
    { \$set: { approved: true, name: 'TestUser' } }
  )
"
```

### 4. Paywall
RevenueCat/Google Play Billing doesn't work on emulators. Dismiss with X button or back gesture.

## Test Personas

Use these for multi-persona or parallel testing:

| Persona | Age | Phone | AVD | Interests |
|---------|-----|-------|-----|-----------|
| Jake (Austin, TX) | 24 | +16505551234 | Pixel_4a_API_33 | Modern Wisdom, Huberman Lab |
| Sarah (Brooklyn, NY) | 31 | +16505551235 | Medium_Phone_API_35 | Tim Ferriss, Lex Fridman |
| Marcus (Chicago, IL) | 19 | +16505551236 | Small_Phone_API_35 | Joe Rogan |

All test phone numbers must be registered in Firebase Console with verification code `000000`.

## Parallel Multi-Agent Testing

Launch multiple Claude Code agents, each controlling a different emulator with a different persona:

```
Task(subagent_type="general-purpose", run_in_background=true, prompt="
  You are Jake, a 24yo tech bro from Austin. Your emulator is emulator-5554.
  Use Maestro and adb with --device emulator-5554 to explore the app.
  Focus on: Modern Wisdom, Huberman Lab.
  Journal all findings to /tmp/jake/journal.md
  [include the testing loop instructions from this skill]
")
```

Repeat for each persona with their respective emulator serial, interests, and output directory.

## Journal Format

Create a markdown journal file. For each screen, record:

```markdown
## Screen N: [Descriptive Name]

**What I see:**
- [Describe all visible UI elements]

**Observations:**
- [UX quality, design consistency, bugs spotted]

**Issues found:**
- [Category: C/H/M/L] [Description]

**Next action:** [What you'll tap/do next]

---
```

## Final Report Format

At the end of the session, produce a categorized report:

### Issue Severity Levels

| Level | Meaning | Examples |
|-------|---------|---------|
| **Critical** | Blocks core user flow | Dead-end loops, can't complete onboarding |
| **High** | Significant UX problems | React errors shown to users, broken navigation |
| **Medium** | Noticeable quality issues | Grammar errors, spelling inconsistency, console.logs |
| **Low** | Polish / nice-to-have | Missing testIDs, minor spacing issues |

### Report Sections
1. **How the test was conducted** - tools, setup, methodology
2. **Steps to reproduce** - exact Maestro commands for each screen
3. **Issues found** - tables by severity with screen number references
4. **Quick wins** - issues fixable in < 1 hour
5. **Recommendations by priority** - Immediately / Short-term / Medium-term

## Getting Started

When this skill is invoked:

1. Check prerequisites (adb, maestro, magick, mongosh)
2. List running emulators (`adb devices`)
3. Ask the user which flow/area to test (onboarding, quiz, navigation, etc.) or do a full walkthrough
4. Create a scratchpad directory: `mkdir -p /tmp/exploratory-test-$(date +%Y%m%d)`
5. Create a journal file in that directory
6. Clear app data for a fresh start: `adb shell pm clear app.retainit.dev.app`
7. Launch the app: `adb shell am start -n app.retainit.dev.app/.MainActivity`
8. Take the first screenshot and begin the explore loop
