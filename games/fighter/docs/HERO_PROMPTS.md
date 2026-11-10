# 抽象梗格斗 · 英雄素材 AI 出图提示词

> 给 GPT / DALL·E / 即梦 / 豆包 用的全套提示词。
> 目标：8 位英雄各出 **1 张半身像（UI/VS/图鉴）** + **1 张 6 帧动作表（战斗用）**。
> 出图后按第 4 节处理，直接丢进 `games/fighter/assets/hero/` 就能用。

---

## 0. 三步走

1. **先出「牛犇犇」半身像**（它是风格锚点）。
2. 后面 7 位全部带上这句话 + 附上牛犇犇的图：
   > `Same art style, same line weight, same shading as the attached reference image.`
3. 全部出完再统一抠图、切图、改名（第 4 节）。

> 为什么必须锚定：AI 每次出图风格都会飘。锚定一张之后，8 个英雄才像同一款游戏里的角色。

---

## 1. 全局风格块（每条提示词前面都要拼上）

### 1.1 风格前缀（英文，必带）

```
2D cartoon fighting game character art, thick clean dark outline (#3A3A3A),
flat cel shading with a single soft highlight, chunky exaggerated proportions,
big head roughly 45% of body height, simple bold expressive eyes,
mobile arcade game style, modern Chinese internet meme humor vibe,
crisp vector look, high contrast, readable at 128px
```

### 1.2 背景要求（每张都要写）

```
isolated single character, solid flat 【背景色】 background, no shadow cast on background,
character centered and filling 80% of the frame
```

背景色按每个英雄填，见第 3 节表格 —— **目的是方便一键抠图**，别让背景色和角色配色撞。

### 1.3 负面提示词（Negative prompt，每次都贴）

```
text, letters, watermark, signature, logo, brand name, UI frame,
photorealistic, 3D render, CGI, gradient mesh, airbrush, blurry, low resolution,
jpeg artifacts, extra limbs, extra heads, duplicated character,
background scenery, floor, furniture, drop shadow on background, cropped head
```

### 1.4 出图参数

| 项 | 值 |
|---|---|
| 尺寸 | 半身像 `1024×1024`（正方形）<br>动作表 `1536×1024`（横向一排 6 格） |
| 张数 | 每个英雄 1 张半身 + 1 张动作表 = 16 张（+ 候选英雄） |
| 风格一致性 | 首图出好后作为 reference image 附给后续每条 |
| 反面案例 | 一旦出现文字 / 品牌 logo / 真实照片风 → 直接重出，不要将就 |

---

## 2. 两个通用模板

### 模板 A · 半身像（UI / VS 界面 / 英雄图鉴）

```
【1.1 风格前缀】,
bust portrait of 【角色描述】, head and shoulders, three-quarter view facing right,
【表情与特征】, 【服装/配饰】,
【1.2 背景要求】,
【1.3 负面提示词】
```

### 模板 B · 动作表（战斗动画帧）

```
【1.1 风格前缀】,
character sprite sheet of 【角色描述】, 6 full-body poses arranged in one horizontal row,
evenly spaced with clear gaps, identical character design and identical color palette in every pose,
pure side-scrolling fighting game view,
poses from left to right:
1) idle relaxed standing, 2) walking forward, 3) wind-up attack punch,
4) taking a hit and staggering backwards, 5) knocked down lying on the floor,
6) victory pose with both arms raised,
no labels, no numbers, no text, no dividing lines,
【1.2 背景要求】,
【1.3 负面提示词】
```

---

## 3. 八位英雄 · 逐个提示词

命名对照（**提示词里绝对不要写原名、真人名、品牌名**）：

> **当前实际落地情况（以 `src/core/heroes.ts` 为准）**
>
> 首期只做了 3 位，且资源 key 与显示名是分开的 —— 改显示名不用重出图：
>
> | 资源 key | 当前显示名 | 对应下面第几行提示词 | 大招 |
> |---|---|---|---|
> | `niu` | 牛来 | 第 1 行「牛犇犇」 | 妈妈——（单段 38） |
> | `gu` | 奶娃 | 第 4 行「奶嗝娃」 | 魔性笑声（6 段 × 6） |
> | `nai` | 咕咕嘎嘎 | 第 2 行「鸽斯拉」 | 鸽群弹幕（3 段 × 12） |
>
> 第 3、5、6、7、8 行是备选英雄，尚未出图。改英雄显示名只改 `heroes.ts` 的 `name`，`assets/hero/{key}_*` 不受影响。


| # | 英雄 | 梗来源 | 定位 | 主色 | 背景色 |
|---|---|---|---|---|---|
| 1 | 牛犇犇 | 小牛喊「妈妈——」 | 均衡型 / 声波远程 | 奶油白 + 粉鼻 | `#00B140` 绿 |
| 2 | 鸽斯拉 | 疯狂的鸽子「咕咕嘎」 | 弹幕骚扰 / 高速 | 蓝灰 + 洋红颈环 | `#FFD400` 亮黄 |
| 3 | 脆角喵 | 妙脆角小猫 | 受击反击 / 卖惨蓄力 | 橘 + 奶油白 | `#FF00FF` 洋红 |
| 4 | 奶嗝娃 | 奶娃抱肚子魔性笑 | 控制 / 笑声干扰 | 肤粉 + 婴儿粉 | `#29B6F6` 天蓝 |
| 5 | 闪身哥 | 闪身步 / 花鼓灯 | 速度 / 位移突进 | 大红 + 金 | `#00B140` 绿 |
| 6 | 显眼包 | 显眼包 + 闪光灯 | 干扰 / 致盲控制 | 荧光黄绿 + 紫 | `#616161` 深灰 |
| 7 | 狗熊哆嗦毛 | 狗熊哆嗦毛 | 防守 / 血厚反伤 | 棕 + 浅棕 | `#00B140` 绿 |
| 8 | 卡皮（待定） | 卡皮巴拉 | 反制 / 慢速高伤 | 土黄 + 橘 | `#FF00FF` 洋红 |

---

### 3.1 牛犇犇（niu）· 风格锚点，先出这张

**半身像**
```
2D cartoon fighting game character art, thick clean dark outline (#3A3A3A), flat cel shading
with a single soft highlight, chunky exaggerated proportions, big head roughly 45% of body
height, simple bold expressive eyes, mobile arcade game style, modern Chinese internet meme
humor vibe, crisp vector look, high contrast, readable at 128px,
bust portrait of a cute chubby baby calf (young cow) character, head and shoulders,
three-quarter view facing right, cream-white fur, large pink muzzle, big round glossy
black eyes with white catchlights, two tiny nub horns, one ear flopping sideways,
round puffy cheeks, mouth wide open mid-shout showing a small pink tongue and two tiny
bottom teeth, wearing a small red neck scarf, exaggerated screaming expression,
isolated single character, solid flat #00B140 green background, no shadow cast on background,
character centered and filling 80% of the frame,
text, letters, watermark, signature, logo, photorealistic, 3D render, gradient mesh,
blurry, extra limbs, background scenery, drop shadow on background, cropped head
```

**动作表**
```
[模板 B 的角色描述填] a cute chubby baby calf character, cream-white fur, pink muzzle,
tiny nub horns, red neck scarf, big round black eyes
```

**大招立绘（可选，进「大招演出」时用）**
```
Same character, extreme close-up dramatic pose, mouth stretched impossibly wide screaming,
visible sound wave rings blasting outward from the mouth, tears of effort at eye corners,
screen-shake energy lines, dark radial burst background in #00B140 green
```

---

### 3.2 鸽斯拉（ge）

**半身像**
```
【1.1 风格前缀】,
bust portrait of an angry cartoon pigeon character, head and shoulders, three-quarter view
facing right, blue-grey feathers, iridescent magenta-pink neck ring, bright orange beak,
glowing red eyes, crest feathers standing straight up in rage, comically gritted teeth
showing from the side of the beak, a tiny scar over one eyebrow, puffed-up chest,
【1.2 背景 #FFD400】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] an angry cartoon pigeon character, blue-grey feathers, magenta neck ring,
bright orange beak, red eyes, crest feathers up
```

**大招立绘**
```
Same character, flapping both wings forward, a swarm of tiny identical pigeon silhouettes
firing outward like a barrage, motion blur streaks, #FFD400 yellow radial burst background
```

---

### 3.3 脆角喵（miao）

> ⚠️ 「妙脆角」是品牌名，提示词里只能描述成「锥形玉米零食帽」，不能写品牌。

**半身像**
```
【1.1 风格前缀】,
bust portrait of a sad cute cartoon kitten character, head and shoulders, three-quarter view
facing right, orange and cream tabby fur, huge watery teary eyes with trembling highlights,
downturned mouth, tiny paws raised near the cheeks, wearing a conical orange corn-snack hat
tilted on top of the head, one whisker bent, looking like it is about to cry,
【1.2 背景 #FF00FF】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] a sad cute orange tabby kitten character with a conical orange corn-snack
hat on its head
```

**大招立绘**
```
Same character, hat exploding into a shower of orange cone-shaped corn snacks, tears flying,
comically furious crying face, #FF00FF magenta burst background
```

---

### 3.4 奶嗝娃（nai）

**半身像**
```
【1.1 风格前缀】,
bust portrait of a chubby cartoon baby character, head and shoulders, three-quarter view
facing right, round bald head with a single curl of hair, huge open-mouth belly laugh,
eyes squeezed shut into happy crescent arcs, both hands clutching the belly, pink onesie,
pacifier clipped to the collar with a short strap, a little milk drool at the corner of
the mouth, extremely infectious goofy laughter,
【1.2 背景 #29B6F6】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] a chubby cartoon baby character, bald head with one curl, pink onesie,
pacifier on a collar clip
```

**大招立绘**
```
Same character, leaning backwards laughing hysterically, hands on belly, wide open mouth,
visible laughter sound waves as concentric distorted rings, small burp cloud, comedic
"W" shaped mouth, #29B6F6 blue burst background
```

---

### 3.5 闪身哥（shan）

**半身像**
```
【1.1 风格前缀】,
bust portrait of an energetic cartoon street dancer character, head and shoulders,
three-quarter view facing right, spiky black hair, big confident grin, red silk sash
across the chest, a small traditional waist drum strapped at the hip, fingerless gloves,
faint motion afterimage streaks trailing behind the shoulders, one eyebrow raised cockily,
【1.2 背景 #00B140】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] an energetic cartoon street dancer, spiky black hair, red silk sash,
small waist drum at the hip, fingerless gloves
```

**大招立绘**
```
Same character, mid-sidestep dash with three overlapping motion afterimages of himself,
red silk ribbon spiralling around him, drumsticks spinning, speed lines,
#00B140 green burst background
```

---

### 3.6 显眼包（xian）

**半身像**
```
【1.1 风格前缀】,
bust portrait of a flashy show-off cartoon character, head and shoulders, three-quarter view
facing right, oversized neon-yellow-lime puffer jacket, purple tinted sunglasses,
a camera flash unit strapped on top of the head firing a bright white burst, smug smirk,
sparkle glints around the head, one hand doing a cocky pose near the chin,
【1.2 背景 #616161】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] a flashy show-off cartoon character, neon-lime puffer jacket, purple
sunglasses, camera flash unit strapped on the head
```

**大招立绘**
```
Same character, both arms spread wide, head-mounted flash firing an enormous starburst
that whites out the middle of the frame, purple lens flare rings, #616161 dark grey
background with harsh white light
```

---

### 3.7 狗熊哆嗦毛（xiong）

**半身像**
```
【1.1 风格前缀】,
bust portrait of a fluffy cartoon brown bear character, head and shoulders, three-quarter
view facing right, fur standing on end in every direction as if shivering, chattering
gritted teeth, wide anxious eyes with tiny pupils, tiny red scarf, trembling motion lines
around the body, small nervous steam puffs from the mouth, trying hard to look tough
but clearly scared,
【1.2 背景 #00B140】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] a fluffy cartoon brown bear with fur standing on end, tiny red scarf,
chattering teeth, trembling
```

**大招立绘**
```
Same character, fur fully puffed out into a spike ball, roaring while shivering, shockwave
rings, red scarf whipping, #00B140 green burst background
```

---

### 3.8 第 8 位 · 候选 A：卡皮（ka）· 推荐

**半身像**
```
【1.1 风格前缀】,
bust portrait of a capybara character, head and shoulders, three-quarter view facing right,
tan-brown rough fur, deadpan sleepy half-closed eyes, blunt square snout, a small mandarin
orange balanced perfectly on top of the head, thin steam rising, utterly unbothered blank
expression, tiny ears,
【1.2 背景 #FF00FF】,
【1.3 负面】
```

**动作表**
```
[模板 B 角色描述] a capybara character with a small mandarin orange balanced on its head,
deadpan expression
```

---

### 3.9 候选 B：吗喽仔（lou）

**半身像**
```
【1.1 风格前缀】,
bust portrait of a scruffy cartoon macaque monkey character, head and shoulders, three-quarter
view facing right, brown fur, pale pink face, mischievous toothy grin, one hand scratching
the head, chewing a leaf, wearing a ragged tank top,
【1.2 背景 #FF00FF】, 【1.3 负面】
```

### 3.10 候选 C：丧丧马（ma）

**半身像**
```
【1.1 风格前缀】,
bust portrait of a gloomy cartoon horse character, head and shoulders, three-quarter view
facing right, long droopy face, brown coat, half-lidded tired eyes, downturned mouth,
messy mane covering one eye, dark circles under the eyes, exhausted sigh,
【1.2 背景 #FF00FF】, 【1.3 负面】
```

---

## 4. 出图后处理

### 4.1 抠背景（三选一）

| 方式 | 说明 |
|---|---|
| 在线 | remove.bg / 稿定设计，直接传，最快 |
| PS / Figma | 用「选择主体」+ 蒙版，边缘最干净 |
| 本地脚本 | `pip install rembg` → `rembg i in.png out.png`，批量最省事 |

### 4.2 统一尺寸

| 类型 | 目标尺寸 | 说明 |
|---|---|---|
| 半身像 | `512×512` PNG（透明底） | 游戏里再按需缩放，别直接塞 1024 |
| 动作表 | `1536×256` 切 6 格 → `256×256` × 6 | 见下方切片脚本 |

### 4.3 切片 + 压体积脚本

```bash
cd games/fighter
python3 scripts/slice_hero.py assets/hero_raw/*.png
```

（脚本见 `scripts/slice_hero.py`，做的事：切 6 格 → 去背景 → 缩到 256 → 量化到 64 色 → 输出到 `assets/hero/`）

### 4.4 文件命名与放置

```
games/fighter/assets/hero/
├── niu_bust.png          半身像（UI 用）
├── niu_sheet_0.png       动作表切片：idle
├── niu_sheet_1.png       walk
├── niu_sheet_2.png       attack
├── niu_sheet_3.png       hurt
├── niu_sheet_4.png       down
├── niu_sheet_5.png       win
├── ge_bust.png
├── ge_sheet_0.png
└── ...（以此类推，key 见第 3 节表格）
```

---

## 5. 验收清单（不达标就重出，别将就）

- [ ] 纯白/纯色背景干净，抠图后边缘无白边
- [ ] 画面里**没有任何文字、数字、logo、品牌标志**
- [ ] 8 个英雄的**线宽、描边色、阴影层次一致**（放一起看像同一套）
- [ ] 每个英雄配色符合第 3 节表格，不撞色
- [ ] 动作表 6 格**间距均匀、角色大小一致、没有分割线**
- [ ] 半身像头部完整没被裁掉，留出 10% 安全边
- [ ] 系列里没有出现真人照片、真实明星、真实影视角色形象

---

## 6. 兜底方案

AI 出图不理想时：

1. **只让 AI 出半身像**（UI / VS 界面 / 图鉴），战斗内继续用已生成的 Kenney 换头拼装素材（`assets/body` + `assets/head`，已验证可用）。
2. 半身像哪怕只有 8 张，游戏观感提升也最明显 —— 玩家 80% 时间看的是选人和结算界面。
3. 比赛内的 6 帧动画，用「同一张立绘 + 程序化形变（挤压/拉伸/位移/旋转）」也能做出可接受的打击感，参考《猫咪大战争》。

---

## 7. 一键复制区（懒人版）

按顺序复制这 8 段，粘进 GPT 即可（每条都已内置风格和负面词，**只需替换 `【背景色】`**）：

<details>
<summary>点开复制</summary>

1. 牛犇犇 —— 见 3.1
2. 鸽斯拉 —— 见 3.2
3. 脆角喵 —— 见 3.3
4. 奶嗝娃 —— 见 3.4
5. 闪身哥 —— 见 3.5
6. 显眼包 —— 见 3.6
7. 狗熊哆嗦毛 —— 见 3.7
8. 卡皮 —— 见 3.8

</details>
