import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  applyImplicitPermissions,
  applyTimeout,
  computeBasePermissions,
  computeOverwrites,
  ELEVATED_PERMISSIONS,
  Permissions,
} from '../../src/discord/permissions.js';
import { PermissionFlags as P } from '../../src/discord/types/permissions.js';

describe('Permissions', () => {
  it('uses the bits of the documentation', () => {
    expect(P.CreateInstantInvite).toBe(1n);
    expect(P.KickMembers).toBe(2n);
    expect(P.BanMembers).toBe(4n);
    expect(P.ViewChannel).toBe(1n << 10n);
    expect(P.SendMessages).toBe(0x800n);
    expect(P.ModerateMembers).toBe(1n << 40n);
    expect(P.PinMessages).toBe(1n << 51n);
    expect(Object.keys(P)).toHaveLength(52);
  });

  it.each([
    [undefined, 0n],
    [0n, 0n],
    ['BanMembers', 4n],
    [['KickMembers', 'BanMembers'], 6n],
    [['KickMembers', 4n], 6n],
    ['2048', 2048n],
    [new Permissions(6n), 6n],
    [[], 0n],
  ] as const)('is built from %s', (input, bits) => {
    expect(new Permissions(input as never).bits).toBe(bits);
  });

  it.each([['Nope'], [12], [null], [{}], [['BanMembers', 'Nope']]])(
    'refuses %j with a message that helps',
    input => {
      expect(() => new Permissions(input as never)).toThrow(TypeError);
    }
  );

  it('lists the valid names when a name is wrong', () => {
    expect(() => new Permissions('banMembers' as never)).toThrow(
      /"banMembers" is not a permission.*BanMembers/s
    );
  });

  it('checks permissions, an administrator having them all', () => {
    const mod = new Permissions(['KickMembers', 'BanMembers']);
    expect(mod.has('KickMembers')).toBe(true);
    expect(mod.has(['KickMembers', 'BanMembers'])).toBe(true);
    expect(mod.has(['KickMembers', 'ManageGuild'])).toBe(false);
    expect(mod.any(['ManageGuild', 'BanMembers'])).toBe(true);
    expect(mod.any(['ManageGuild'])).toBe(false);
    expect(mod.has([])).toBe(true);

    const admin = new Permissions('Administrator');
    expect(admin.has('ManageGuild')).toBe(true);
    expect(admin.any('ManageGuild')).toBe(true);
    expect(admin.has('ManageGuild', { checkAdmin: false })).toBe(false);
    expect(admin.any('ManageGuild', { checkAdmin: false })).toBe(false);
  });

  it('names what is missing', () => {
    const mod = new Permissions(['KickMembers']);
    expect(mod.missing(['KickMembers', 'BanMembers', 'ManageGuild'])).toEqual([
      'BanMembers',
      'ManageGuild',
    ]);
    expect(mod.missing('KickMembers')).toEqual([]);
    expect(new Permissions('Administrator').missing('BanMembers')).toEqual([]);
  });

  it('never changes: add and remove return new sets', () => {
    const base = new Permissions('KickMembers');
    const more = base.add('BanMembers');
    expect(base.bits).toBe(2n);
    expect(more.bits).toBe(6n);
    expect(more.remove('KickMembers').bits).toBe(4n);
    expect(more.remove('ManageGuild').bits).toBe(6n);
    expect(Object.isFrozen(base)).toBe(true);
  });

  it('becomes the text Discord expects', () => {
    const big = new Permissions(['PinMessages', 'Administrator']);
    expect(big.toString()).toBe(String((1n << 51n) | 8n));
    expect(JSON.stringify({ permissions: big })).toBe(
      `{"permissions":"${(1n << 51n) | 8n}"}`
    );
    expect(big.toArray()).toEqual(['Administrator', 'PinMessages']);
    expect(new Permissions().toArray()).toEqual([]);
  });

  it('marks the permissions that need two-factor authentication', () => {
    expect(ELEVATED_PERMISSIONS).toContain('Administrator');
    expect(ELEVATED_PERMISSIONS).toContain('ManageThreads');
    expect(ELEVATED_PERMISSIONS).not.toContain('SendMessages');
    expect(ELEVATED_PERMISSIONS).toHaveLength(11);
  });
});

describe('the permission algorithm of the documentation', () => {
  const guildId = '100';
  const roles = [
    { id: guildId, permissions: P.ViewChannel | P.SendMessages },
    { id: '201', permissions: P.KickMembers },
    { id: '202', permissions: P.Administrator },
    { id: '203', permissions: P.BanMembers },
  ];
  const base = (memberRoleIds: string[], userId = '2', ownerId = '1') =>
    computeBasePermissions({ guildId, ownerId, userId, memberRoleIds, roles });

  it('gives everything to the owner', () => {
    expect(base([], '1')).toBe(ALL_PERMISSIONS);
  });

  it('adds the roles of the member to @everyone', () => {
    expect(base([])).toBe(P.ViewChannel | P.SendMessages);
    expect(base(['201'])).toBe(P.ViewChannel | P.SendMessages | P.KickMembers);
    expect(base(['201', '203'])).toBe(
      P.ViewChannel | P.SendMessages | P.KickMembers | P.BanMembers
    );
    // A role the server no longer has gives nothing.
    expect(base(['999'])).toBe(P.ViewChannel | P.SendMessages);
  });

  it('gives everything to an administrator', () => {
    expect(base(['202'])).toBe(ALL_PERMISSIONS);
  });

  const inChannel = (
    basePermissions: bigint,
    overwrites: { id: string; allow: bigint; deny: bigint }[],
    memberRoleIds: string[] = ['201', '203']
  ) =>
    computeOverwrites(basePermissions, {
      guildId,
      userId: '2',
      memberRoleIds,
      overwrites,
    });

  it('ignores overwrites for an administrator', () => {
    expect(
      inChannel(P.Administrator, [
        { id: guildId, allow: 0n, deny: P.ViewChannel },
      ])
    ).toBe(ALL_PERMISSIONS);
  });

  it('applies @everyone, then roles, then the member', () => {
    const start = P.ViewChannel | P.SendMessages;
    // @everyone denied…
    expect(
      inChannel(start, [{ id: guildId, allow: 0n, deny: P.SendMessages }])
    ).toBe(P.ViewChannel);
    // …a role allows again…
    expect(
      inChannel(start, [
        { id: guildId, allow: 0n, deny: P.SendMessages },
        { id: '201', allow: P.SendMessages, deny: 0n },
      ])
    ).toBe(start);
    // …and the member overwrite has the last word.
    expect(
      inChannel(start, [
        { id: '2', allow: 0n, deny: P.SendMessages },
        { id: guildId, allow: 0n, deny: P.SendMessages },
        { id: '201', allow: P.SendMessages, deny: 0n },
      ])
    ).toBe(P.ViewChannel);
  });

  it('lets a role that allows win over a role that denies', () => {
    expect(
      inChannel(P.ViewChannel, [
        { id: '201', allow: 0n, deny: P.ViewChannel },
        { id: '203', allow: P.ViewChannel, deny: 0n },
      ])
    ).toBe(P.ViewChannel);
  });

  it('ignores overwrites of roles the member does not have', () => {
    expect(
      inChannel(P.ViewChannel, [
        { id: '555', allow: P.ManageMessages, deny: P.ViewChannel },
      ])
    ).toBe(P.ViewChannel);
    expect(inChannel(P.ViewChannel, [])).toBe(P.ViewChannel);
  });

  it('removes what cannot be done without seeing or writing', () => {
    expect(applyImplicitPermissions(P.SendMessages | P.AttachFiles)).toBe(0n);
    expect(
      applyImplicitPermissions(
        P.ViewChannel | P.AttachFiles | P.EmbedLinks | P.AddReactions
      )
    ).toBe(P.ViewChannel | P.AddReactions);
    const full = P.ViewChannel | P.SendMessages | P.AttachFiles;
    expect(applyImplicitPermissions(full)).toBe(full);
    expect(applyImplicitPermissions(P.Administrator)).toBe(P.Administrator);
  });

  it('leaves a timed out member only reading', () => {
    expect(
      applyTimeout(
        P.ViewChannel | P.ReadMessageHistory | P.SendMessages | P.Connect
      )
    ).toBe(P.ViewChannel | P.ReadMessageHistory);
    expect(applyTimeout(ALL_PERMISSIONS)).toBe(ALL_PERMISSIONS);
  });
});
