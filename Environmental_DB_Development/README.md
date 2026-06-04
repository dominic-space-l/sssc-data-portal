# SSSC Environmental Monitoring Database Drafts
Progress of the development of the Sitka Sound Science Center (SSSC) EM database. Draft databases are written in Python against SQLite for simplicity. 
## 📁 Directory Structure
```
Enviro_Monitor_v0d##/
├── environmental_sensors_v0d##.py   # Database class - SQLite creation, table manipulation
├── draft_test.py                    # Testing file - dummy record insertion, schema generation
├── schema_v0d##.pdf                 # Schema mockup for the draft
├── schema_v0d##.md                  # Markdown schema generated in exercise_draft with sqliteschema
└── notes.txt                        # Notes and feedback on the draft

requirements.txt                     # Required libraries, use with "~bash pip install -r requirements.txt"
```
## 🚀 Quick Start  

### Prerequisites

- **Python 3.9+** (Python 3.13 tested)
- **pip** (Python package manager)
- **SQLite3** (Installed with most Python distributions in the standard library)

### Requirements
   ```bash
   pip install -r requirements.txt
   ```