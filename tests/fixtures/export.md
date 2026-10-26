# 让推导与思路，一起清晰

用公式表达关系，用图表梳理过程。文字、数学与代码，仍保存在同一份 Markdown 中。

## 数学，写在句子之间

质量与能量的关系是 $E = mc^2$，求根公式可以写成 $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$。

$$
\begin{aligned}
\mathcal{L}(\theta) &= \frac{1}{n}\sum_{i=1}^{n}(y_i - f_\theta(x_i))^2 \\
\theta_{t+1} &= \theta_t - \eta\,\nabla_\theta\mathcal{L}(\theta_t)
\end{aligned}
$$

## 把流程，画出来

```mermaid
flowchart LR
    A[写下 Markdown] --> B[即时预览]
    B --> C{继续推敲}
    C -->|编辑| A
    C -->|保存| D[原始 .md 文件]
```

## 一次交互的顺序

```mermaid
sequenceDiagram
    participant W as 写作者
    participant E as 编辑器
    W->>E: 输入中文与公式
    Note over E: 候选期间保持预览稳定
    W->>E: 提交候选
    E-->>W: 更新预览，保留源文
```

点击预览可回到源码。按 ⌘⇧M 查看原始标记，再切回即时模式，内容不会被重写。


## 可靠的 Markdown，完整的预览

| 功能 | 说明 | 状态 |
| :--- | :--- | :---: |
| **中文输入** | 候选、退格与撤销 | 已验收 |
| `Markdown` | 空行、缩进和行尾保持原样 | 已支持 |
| A \| B | 支持单元格中的转义竖线 | 已支持 |

## 本地图片

![Mokune 本地写作流程](assets/preview.svg "纯文本，始终属于你")

## 原样保存，清晰呈现

同一份文稿，可以导出为独立 HTML 或 A4 PDF。公式、图表与图片随文件一起保留，原始 Markdown 始终属于你。

```rust
fn main() { println!("原样保存"); }
```
