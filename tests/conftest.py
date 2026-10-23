import os
import tempfile

os.environ["C3D_READER_CONFIG_DIR"] = tempfile.mkdtemp(prefix="c3d-reader-tests-")
os.environ["C3D_READER_DATA"] = ""
