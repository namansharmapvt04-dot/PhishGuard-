<div align="center">

<img src="https://img.shields.io/badge/PhishGuard-Security%20Tool-red?style=for-the-badge&logo=shield&logoColor=white" alt="PhishGuard" />

# 🛡️ PhishGuard

### AI-Powered Phishing Detection & URL Analysis Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![GitHub Stars](https://img.shields.io/github/stars/namansharmapvt04-dot/PhishGuard-?style=flat-square&color=gold)](https://github.com/namansharmapvt04-dot/PhishGuard-)
[![Issues](https://img.shields.io/github/issues/namansharmapvt04-dot/PhishGuard-?style=flat-square)](https://github.com/namansharmapvt04-dot/PhishGuard-/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

<br/>

> **Protect yourself and your users from phishing attacks with real-time URL scanning, threat intelligence, and machine-learning-based detection.**

<br/>

[🚀 Getting Started](#-getting-started) • [✨ Features](#-features) • [📸 Screenshots](#-screenshots) • [🤝 Contributing](#-contributing) • [📄 License](#-license)

</div>

---

## 📖 Table of Contents

- [About the Project](#-about-the-project)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Screenshots](#-screenshots)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 🔍 About the Project

**PhishGuard** is an intelligent cybersecurity tool designed to detect, analyze, and block phishing URLs in real time. Leveraging machine learning models, heuristic analysis, and threat intelligence feeds, PhishGuard helps individuals and organizations stay protected against one of the most common forms of cyberattack.

Phishing attacks account for over **36% of all data breaches** (Verizon DBIR, 2024). PhishGuard provides a multi-layered defense system to identify malicious links before they cause harm.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔗 **URL Scanner** | Instantly scan any URL for phishing indicators |
| 🤖 **ML Detection** | Machine learning model trained on thousands of phishing/legitimate URLs |
| 🌐 **Threat Intelligence** | Integration with external threat intelligence feeds |
| 📊 **Risk Scoring** | Detailed risk score with explanation of detected red flags |
| 🔔 **Real-time Alerts** | Get notified when a suspicious link is detected |
| 📈 **Analytics Dashboard** | Visual dashboard showing scan history and threat trends |
| 🧩 **Browser Extension** | Optional browser extension for on-the-fly protection |
| 🔑 **REST API** | Public API for developers to integrate PhishGuard into their apps |
| 📋 **Whitelist / Blacklist** | Manage custom trusted and blocked domains |
| 🔒 **Privacy First** | No user data is stored; scans are ephemeral |

---

## 🛠️ Tech Stack

**Backend:**
- ![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white) Python 3.8+
- ![Flask](https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white) Flask / FastAPI
- ![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=flat-square&logo=scikit-learn&logoColor=white) scikit-learn (ML model)

**Frontend:**
- ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) HTML5
- ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) CSS3
- ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) JavaScript (Vanilla)

**Data & Intelligence:**
- ![SQLite](https://img.shields.io/badge/SQLite-07405E?style=flat-square&logo=sqlite&logoColor=white) SQLite / PostgreSQL
- VirusTotal API
- Google Safe Browsing API

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

- Python `3.8` or higher
- `pip` (Python package manager)
- Git

```bash
python --version   # Should be 3.8+
pip --version
git --version
```

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/namansharmapvt04-dot/PhishGuard-.git
cd PhishGuard-
```

2. **Create and activate a virtual environment**

```bash
# On Windows
python -m venv venv
venv\Scripts\activate

# On macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

3. **Install dependencies**

```bash
pip install -r requirements.txt
```

4. **Run the application**

```bash
python app.py
```

The application will be running at `http://localhost:5000`

### Configuration

Copy the example environment file and configure your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# App Settings
SECRET_KEY=your_secret_key_here
DEBUG=False

# API Keys
VIRUSTOTAL_API_KEY=your_virustotal_api_key
GOOGLE_SAFE_BROWSING_KEY=your_google_api_key

# Database
DATABASE_URL=sqlite:///phishguard.db
```

> 💡 **Tip:** You can get a free VirusTotal API key at [virustotal.com](https://www.virustotal.com) and a Google Safe Browsing key from the [Google Cloud Console](https://console.cloud.google.com/).

---

## 💡 Usage

### Scan a URL via Web Interface

1. Open `http://localhost:5000` in your browser
2. Paste the URL you want to check into the input box
3. Click **"Scan URL"**
4. View the detailed analysis report with risk score

### Scan via CLI

```bash
python phishguard.py scan --url "https://example-suspicious-site.com"
```

Sample output:
```
🔍 Scanning: https://example-suspicious-site.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  RISK SCORE: 87/100 — HIGH RISK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚩 Domain registered < 30 days ago
🚩 IP-based URL detected
🚩 Suspicious keyword in domain: "login", "verify"
🚩 SSL certificate mismatch
🚩 Flagged by VirusTotal (3/90 engines)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Recommendation: DO NOT visit this URL
```

### Use the REST API

```bash
# Scan a URL
curl -X POST http://localhost:5000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://suspicious-site.com"}'
```

**Response:**

```json
{
  "url": "https://suspicious-site.com",
  "risk_score": 87,
  "risk_level": "HIGH",
  "is_phishing": true,
  "indicators": [
    "Domain age < 30 days",
    "Suspicious keywords detected",
    "SSL mismatch"
  ],
  "scanned_at": "2026-09-29T15:06:57+05:30"
}
```

---

## 📁 Project Structure

```
PhishGuard-/
├── 📁 models/              # ML model files
│   ├── phish_model.pkl
│   └── vectorizer.pkl
├── 📁 static/              # CSS, JS, images
│   ├── css/
│   └── js/
├── 📁 templates/           # HTML templates
│   ├── index.html
│   └── report.html
├── 📁 data/                # Training datasets
│   ├── phishing_urls.csv
│   └── legitimate_urls.csv
├── 📁 tests/               # Unit and integration tests
│   ├── test_scanner.py
│   └── test_api.py
├── 📄 app.py               # Main Flask application
├── 📄 phishguard.py        # CLI entry point
├── 📄 scanner.py           # Core URL scanning logic
├── 📄 train_model.py       # ML model training script
├── 📄 requirements.txt     # Python dependencies
├── 📄 .env.example         # Example environment variables
└── 📄 README.md            # This file
```

---

## 📡 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/scan` | `POST` | Scan a URL for phishing |
| `/api/batch-scan` | `POST` | Scan multiple URLs at once |
| `/api/report` | `GET` | Get scan report by ID |
| `/api/whitelist` | `POST` | Add a domain to whitelist |
| `/api/blacklist` | `POST` | Add a domain to blacklist |
| `/api/stats` | `GET` | Get overall scanning statistics |

---

## 📸 Screenshots

> _Screenshots will be added as the project develops._

---

## 🗺️ Roadmap

- [x] Core URL scanning engine
- [x] ML-based phishing detection
- [x] REST API
- [x] Web interface
- [ ] Browser extension (Chrome & Firefox)
- [ ] Email phishing scanner
- [ ] Real-time threat feed integration
- [ ] Docker containerization
- [ ] Mobile app

---

## 🤝 Contributing

Contributions are what make the open-source community amazing! Any contributions you make are **greatly appreciated**.

1. **Fork** the Project
2. **Create** your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your Changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the Branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

## 🐛 Bug Reports

If you find a bug, please open an [issue](https://github.com/namansharmapvt04-dot/PhishGuard-/issues) with:
- A clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

## 📬 Contact

**Naman Sharma**

[![GitHub](https://img.shields.io/badge/GitHub-namansharmapvt04--dot-black?style=flat-square&logo=github)](https://github.com/namansharmapvt04-dot)

Project Link: [https://github.com/namansharmapvt04-dot/PhishGuard-](https://github.com/namansharmapvt04-dot/PhishGuard-)

---

<div align="center">

Made with ❤️ by [Naman Sharma](https://github.com/namansharmapvt04-dot)

⭐ **Star this repo if you find it helpful!** ⭐

</div>
