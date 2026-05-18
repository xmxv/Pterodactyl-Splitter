# Pterodactyl Panel - Server Splitter

Split a server's resources into multiple child servers. Free and open source - no need to pay $20 for the alternative.

## Features
- Atomically splits CPU, RAM, disk, swap, databases, allocations and backups from the master server
- Enforces per-server split limits configurable from the admin panel
- Child servers inherit the egg, node and owner of the master automatically
- Sync subusers from the master server to the child on creation
- Master server card shows remaining resources vs total at a glance
- Delete child servers directly from the Splitter tab

## Requirements
- Blueprint framework installed
- Pterodactyl Panel (tested on beta-2026-01)
- The master server must have more than 1 allocation assigned on its node - one allocation is consumed per child server created

## Installation

Download the latest `splitter.blueprint` from releases and upload it to `/var/www/pterodactyl`, then run:

```bash
blueprint -i splitter.blueprint
```

The extension will appear in your extensions list once installed.

## Usage
- Navigate to a server and open the Splitter tab
- The server must have a split limit greater than 0, configurable per server in the admin panel
- Fill in the resource fields - available amounts are shown in each field label
- Child servers are managed and deleted through the Splitter tab
- Deleting the master server will also remove all of its children

## Common issues 
- If you get a UTF-8 locale error, run: ``LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 blueprint -i splitter.blueprint``
- If you receive a `DaemonConnectionException` in browser console, run: ``unzip -p /var/www/pterodactyl/splitter.blueprint splitter/app/SplitController.php | sed 's/{identifier}/splitter/g' > /var/www/pterodactyl/.blueprint/extensions/splitter/app/SplitController.php
php artisan optimize:clear``

Any issues, report them or open a ticket via https://discord.gg/6r2jqvFS7e
