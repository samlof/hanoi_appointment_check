#!/bin/sh

scp package* fate.fi:~/seat_checker/
scp tsconfig* fate.fi:~/seat_checker/
scp .eslint* fate.fi:~/seat_checker/

scp -rp src fate.fi:~/seat_checker/