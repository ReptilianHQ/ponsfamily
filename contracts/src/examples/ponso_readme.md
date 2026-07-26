# Ponso ($PONSO)
### The official mascot of pons.family

![Ponso](./ponso.png)

> "He already knows what you're about to say, and he's already unimpressed."

> This is a walkthrough README. Its purpose is to explain, step by step and using $PONSO as the example, how a launch on pons.family actually works from creation through graduation.

---

## 1. Who He Is

Ponso  is the official mascot of pons.family, and he has never once been convinced by anything on the first try.

Not a placeholder, not a temporary face, not one option among several. Ponso is the mascot, the one that represents pons.family everywhere the brand shows up. Arms crossed, ears back just slightly, one eyebrow doing all the talking. He doesn't posture, he doesn't need to raise his voice, and he definitely doesn't chase anything that isn't worth chasing. He just stands there, tail curled, collar on, waiting for whatever's in front of him to prove it deserves his attention.

Around his neck is a simple black collar with a single silver tag. One letter. P. Not a name tag in the usual sense, more like a signature, the kind of mark you leave behind when you don't feel the need to explain yourself further.

---

## 2. The Look

Everything about Ponso says the same thing from a different angle.

The crossed arms mean the decision has already been made and there is no more room left to negotiate. The narrowed eyes mean he saw the angle before you finished pitching it. The whiskers, the twitch of the tail, the slight tilt of the head, none of it is nerves. It's patience running out on his own schedule, not yours.

He isn't drawn to look cute so you'll trust him. He's drawn to look like he's already caught you trying something, and he's simply choosing, for now, not to say anything about it. That's exactly why he's the one representing pons.family and not someone else.

---

## 3. What He Represents

Ponso is the face of not falling for it, and as the official mascot, that's the standard the whole ecosystem gets measured against.

He's the skepticism that should exist before hype does. The pause before the ape. The look a cat gives you right before you do something you already know is a bad idea, the one that says he warned you without saying a single word. He's unbothered by noise, unmoved by promises, and completely uninterested in whatever everyone else is currently losing their mind over.

He doesn't get rugged. Not because he's lucky, but because he never uncrosses his arms long enough to get close enough to be rugged in the first place. That's the reputation pons.family wanted standing at the front, so that's who stands at the front.

---

## 4. Launch Walkthrough (Example)

This section exists to explain, phase by phase, how a launch on pons.family works. $PONSO is used here purely as the example token, so every stage below can be followed in order, one step at a time.

### Step 1: Creation

A name, a symbol, a logo, a description, and a set of socials get submitted along with a chosen configuration. Every parameter gets checked before anything goes live. Ponso doesn't move until the details are right, and neither does this step.

### Step 2: Deployment

The token gets deployed deterministically and registered permanently on chain before a single trade happens. Nothing about this step is improvised.

### Step 3: Liquidity Initialization

Liquidity gets created automatically through the chosen DEX configuration, in one single atomic action. There is no in between moment where liquidity exists but isn't protected yet. No gap, no opening, nothing to slip through.

### Step 4: Protected Trading Window

For a defined window, anti sniping rules, maximum wallet limits, maximum transaction limits, and initial buyer permissions are all enforced automatically. No manual intervention required. Ponso doesn't ask anyone to watch his back. He just already has it covered.

### Step 5: Open Trading

Once the protection window closes, restrictions lift automatically and the token behaves like a standard ERC20 from that point forward. The dangerous early window, the one snipers actually try to exploit, is already behind it.

### Step 6: Graduation

Once the on chain requirements are met, graduation is recognized directly from chain state. No approval process, no discretion, no exceptions. Either the thresholds are met, or they aren't.

### Step 7: Reference Point

After graduation, the token stands as a complete, observable example of the entire process from beginning to end, the same way Ponso has always stood: arms crossed, already finished deciding, nothing left unresolved.

---

## 5. Contract Technical Reference

$PONSO is created and managed by the same production contracts that power every launch on pons.family. There's no special logic hiding underneath the branding. It demonstrates the exact same lifecycle every token on the platform goes through.

### 5.1 PonsLaunchFactory: Launch Orchestration

| Function | Role for $PONSO |
|---|---|
| `launchToken(TokenParams, launchConfigId, dexId, salt)` | Deploys $PONSO, initializes liquidity, creates the launch, and executes the entire process atomically |
| `predictTokenAddress(...)` | Shows how the token address is deterministic before launch even happens |
| `graduationStatus(token)` | Shows how graduation gets determined directly from on chain liquidity data |
| `getLaunchedToken(token)` | Returns the permanent launch record for $PONSO |
| `addDexConfig` / `addLaunchConfig` | Registers the launch configurations used throughout the documentation |
| `setLaunchEnabled` / `setWhitelistedLauncher` | Demonstrates protocol level launch permissions |

### 5.2 PonsLauncherToken: Launch Behavior

| Function | Role for $PONSO |
|---|---|
| `constructor(...)` | Creates the token supply, stores metadata, and initializes the launch state |
| `_update(from, to, value)` | Handles launch protection, anti sniping, and transfer restrictions |
| `liquidityPool()` | Resolves the canonical liquidity pool created during launch |
| `maxWalletLimit()` / `maxTxLimit()` | Shows the active wallet and transaction restrictions |
| `setInitialBuyRecipient(address)` | Allows the protocol's initial seed purchase during launch |
| `socials()` / `getTokenInfo()` | Returns the metadata used throughout the documentation examples |
| `_isPairPool(candidate)` | Detects valid liquidity pools created by the protocol |

---

## 6. Why It Matters

$PONSO serves several purposes at once. As the official mascot token, it's the canonical example and reference point used throughout pons.family. It's a developer education tool showing the complete lifecycle start to finish. It's a reference implementation that every SDK, tutorial, guide, and integration can point back to. It's useful for regression testing, since future protocol versions can recreate $PONSO to check behavioral compatibility. It helps validate infrastructure, since lockers, launch configurations, DEX integrations, and protocol upgrades can all be tested against one known reference. And above all, it carries the face pons.family put forward as its own.

---

## 7. The Future of $PONSO

To be completely clear about what this is: $PONSO is the official mascot and documentation token of pons.family. It has no holder utility. It's not meant for speculation. Its purpose is to be the permanent identity, and reference point, the ecosystem is built around.

Every tutorial, every guide, every SDK example, every frontend, every explorer, every audit, every future launch can all point back to one complete, canonical example, wearing one collar, one tag, arms crossed the whole time.

$PONSO.

---

> "He's not here to like you. He's here to see if you deserve it."

**Ponso ($PONSO)**
The official mascot of pons.family.
