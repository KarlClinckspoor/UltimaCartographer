# Runs OUT.EXE under DOSBox via u1-decompiled's ktest: puts a character with a given seed on a dungeon
# entrance, enters, dumps each level's cell array (AD56, 11 x 11 x 8 bytes), climbs down, repeats.
# Usage: python -I tools/verify-u1-dungeon.py <u1-decompiled> SEED X Y tests/fixtures/u1-dungeon-seedSEED-X-Y.json
# (needs u1-decompiled with its DOSBox setup; writes {level: cells[x][y]} for levels 1-10)
import sys, json, struct, shutil, os
u1, seed, wx, wy, outp = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
sys.path.insert(0, os.path.join(u1, 'tools'))
import ktest

player = os.path.join(os.path.dirname(os.path.abspath(outp)), 'PLAYER1.U1')
shutil.copy(os.path.join(u1, 'build', 'run_gen', 'PLAYER1.U1'), player)

s = ktest.Script()
s.wait(200)
s.poke(0x3AAA, struct.pack('<HHH', seed, wx, wy))
s.keys('E'); s.wait(120)
s.dump(0, 0xAD56, 968)
for L in range(2, 11):
    lx, ly = (3, 7) if (L - 1) % 2 == 1 else (7, 3)   # the down ladder of level L-1
    s.poke(0xAD3E, struct.pack('<HH', lx, ly))
    s.poke(0xAD52, struct.pack('<H', 4))
    s.keys('K'); s.wait(120)
    s.dump(L - 1, 0xAD56, 968)
s.wait(20)
s.end()
out, wd = ktest.run('out', s, files=[player], prefix='C 1', workname='cartographer')
levels = {}
for idx, data in sorted(out.items()):
    cells = struct.unpack('<484h', data[:968])
    a = [[cells[(x * 11 + y) * 4] for y in range(11)] for x in range(11)]
    levels[idx + 1] = a
json.dump(levels, open(outp, 'w'))
print('levels dumped:', sorted(levels))
