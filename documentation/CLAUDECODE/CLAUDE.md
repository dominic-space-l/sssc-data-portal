# Instructions for ClaudeCode models
## Versioning
maintain the CHANGELOG.md for each major directory (map, authentication, portal). Changelogs are found in documentation/map, /authentication, and /portal. Each entry should contain a short summary of what changed, and a list of all files changes. If no changelog exists for one of the major directorys, build one from commit history. Versioning for uv projects and similar should be xx.yy.zz. xx is major feature version, yy is steps or commits to complete a major feature (like from a written plan), and zz is small updates (such as revisions to a plan midway, user feedback to claude, etc).
## Code Style
- All typescript/Angular code should follow Angular v22 style guide and Google's typescript style guide.  
- All python should follow pep8 and Google's python style guide  
- All functions and classes should have a docstring with args and usage.  
- All classes should have a brief docstring  
- All code files should have a brief comment at the top with usage instructions and role.  
- Code should broadly aim to follow object-orient design and SOLID principles, where reasonably applicable.  
## Planning
Major changes should come with their own plan document, which lives in documentation/map or /portal or /authentication
## Directories
README's should always contain a quickstart guide, setup instructions, and directory guides as minimum.