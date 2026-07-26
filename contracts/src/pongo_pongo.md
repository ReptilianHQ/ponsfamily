# Pongo by Pons ($PONGO)
### The canonical launch walkthrough mascot token of pons.family

> "He's not fast. He's not loud. He's just always there when you get home."

**Contract Address (CA):** `0xedaee44320107caa714baaec486261a87f27022d`

> This is a documentation and test token. No holder utility. No promises. Just a very good dog.

---

## 1. Who He Is

Pongo is a small dog who has never once taken his house off his head. Nobody remembers exactly when it happened, whether he was born under it or built it himself plank by plank, but by the time anyone met him it was already there: green roof, little chimney, sitting on top of him like it grew that way.

He doesn't move fast and he doesn't chase anything. He wears glasses too big for his face and reads everything twice before deciding what he thinks of it. Under the house, under the glasses, there's an old plaid shirt that's clearly been worn a thousand times, soft in the way only real use makes fabric soft.

He isn't dressed to impress anyone. He's just always already comfortable, house intact, glasses on, exactly where he was left.

---

## 2. What He Represents

The house was never a costume. It's just where he lives, and he happens to live everywhere he goes. There's an old joke that a house that only shows up when the weather turns bad isn't a home, it's a reaction. Pongo's house doesn't come and go with the weather. It's simply always there, which is exactly why nobody worries about the weather when he's around.

That same idea runs through $PONGO as a walkthrough token: a shelter only means something if it's still standing before the storm even starts, not something bolted on after the fact.

---

## 3. Launch Walkthrough

The entire lifecycle of a launch on pons.family can be understood through $PONGO.

### Step 1: Token Creation

A name, a symbol, a logo, a description, socials, and a launch configuration get submitted. Every parameter gets validated before deployment.

### Step 2: Deployment

`PonsLaunchFactory` deploys the token deterministically. The launch is permanently registered on chain, roof already in place, before a single trade has happened.

### Step 3: Liquidity Initialization

Liquidity gets created automatically through the selected DEX configuration. The launch completes in one single atomic step, so there's never a moment where the liquidity exists but isn't protected yet.

### Step 4: Protected Launch

During the protection window, the protocol automatically enforces anti sniping rules, maximum wallet limits, maximum transaction limits, and initial buyer permissions. No administrator has to step in and do this manually.

### Step 5: Open Trading

Once the restriction period ends, the launch protections lift automatically. The token behaves like a normal ERC20 from that point on.

### Step 6: Graduation

Once the graduation requirements are met, the protocol recognizes the launch as graduated straight from on chain state. Nobody has to approve it by hand. The chain either sees the liquidity thresholds met or it doesn't.

### Step 7: Permanent Reference

After graduation, the launch becomes a permanent reference for future protocol versions, SDKs, documentation, tutorials, and integrations.

---

## 4. What $PONGO Demonstrates

Every stage of a standard pons.family launch: launch configuration, parameter validation, token deployment, liquidity creation, anti snipe protection, wallet restrictions, transaction limits, initial trading, graduation logic, on chain metadata, explorer compatibility, frontend integration, and the complete launch lifecycle start to finish.

---

## 5. Contract Technical Reference

$PONGO is created and managed by the same production contracts that power every launch on pons.family. There's no special logic hiding underneath the branding. It demonstrates the exact same launch lifecycle every future token will go through.

### 5.1 PonsLaunchFactory: Launch Orchestration

| Function | Role for $PONGO |
|---|---|
| `launchToken(TokenParams, launchConfigId, dexId, salt)` | Deploys $PONGO, initializes liquidity, creates the launch, and executes the entire process atomically |
| `predictTokenAddress(...)` | Shows how the token address is deterministic before launch even happens |
| `graduationStatus(token)` | Shows how graduation gets determined directly from on chain liquidity data |
| `getLaunchedToken(token)` | Returns the permanent launch record for $PONGO |
| `addDexConfig` / `addLaunchConfig` | Registers the launch configurations used throughout the documentation |
| `setLaunchEnabled` / `setWhitelistedLauncher` | Demonstrates protocol level launch permissions |

### 5.2 PonsLauncherToken: Launch Behavior

| Function | Role for $PONGO |
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

$PONGO serves several purposes at once. It's the protocol documentation and canonical example used throughout pons.family. It's a developer education tool showing the complete launch process start to finish. It's a reference implementation that every SDK, tutorial, guide, and integration can point back to. It's useful for regression testing, since future protocol versions can recreate $PONGO to check behavioral compatibility. It helps validate infrastructure, since lockers, launch configurations, DEX integrations, and protocol upgrades can all be tested against one known reference launch. And it does mascot duty too, giving the ecosystem a face that actually feels like something worth trusting.

---

> "Some mascots are built to hype you up. This one just wants you to feel like you're home."

**Pongo by Pons ($PONGO)**
The canonical launch walkthrough mascot of pons.family. Test token, no value, no promises, house included.
