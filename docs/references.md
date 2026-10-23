# References and attribution

## Mokka research

- [Mokka official feature overview](https://biomechanical-toolkit.github.io/mokka/index.html): acquisition explorer, 3D trajectories, chart views, event timeline and file I/O informed the scope.
- [Mokka source](https://github.com/Biomechanical-ToolKit/Mokka), inspected at commit `480e2f8ba031f0aadcf2b1fc23455c26e4c15756` (the repository's `proof-of-concept-python-console` branch at inspection time).
- Source files examined include `Code/Data/qMokkaAcquisition.h`, `Code/Data/qMokkaAcquisition.cpp`, and `Code/qMokkaDataManager.cpp`. They establish the use of a BTK acquisition reader and separate point, analog, event and force-plate objects.

Research used the public website and ordinary source inspection. The installed reverse-engineer-anything skill was consulted; no connected REA analysis provider was available, and no binary decompilation or REA runtime evidence is claimed. No Mokka source, binary, visual assets or trademarks were copied into this implementation. Mokka is a reference, not a dependency.

## C3D format

- [C3D technical user guide](https://www.c3d.org/docs/C3D_User_Guide.pdf).
- [Analog scaling](https://www.c3d.org/HTML/Documents/analogscale.htm).
- [py-c3d upstream](https://github.com/EmbodiedCognition/py-c3d) and its installed 0.6.0 implementation, used for parameter metadata parsing and reference frame checks.

## Third-party packages

| Component                     | License            | Use                               |
| ----------------------------- | ------------------ | --------------------------------- |
| py-c3d                        | MIT                | C3D header and parameter decoding |
| NumPy                         | BSD-3-Clause       | Memory-mapped numeric access      |
| FastAPI / Starlette / Uvicorn | MIT / BSD-3-Clause | Local API server                  |
| React / React DOM             | MIT                | Workbench UI                      |
| Three.js                      | MIT                | 3D rendering and orbit controls   |
| Lucide                        | ISC                | Interface icons                   |
| Public Sans / IBM Plex Mono   | SIL OFL 1.1        | Locally bundled fonts             |

The packages retain their upstream license files in their installed distributions. Build and test tools have their own upstream licenses. The application source is independently licensed under MIT.
