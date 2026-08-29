# Stateful example

This fixture proves that a code block runs as one script rather than as isolated lines.

```sh
mkdir -p nested
cd nested
export README_DOCTOR_FIXTURE=works
node -e "if (process.cwd().split(/[\\/]/).pop() !== 'nested' || process.env.README_DOCTOR_FIXTURE !== 'works') process.exit(1)"
```
