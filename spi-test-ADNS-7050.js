
let log = (msg, err) => 
{
    if (err) {
        console.error(err);
    }
    console.log(msg);
}

this.config = 
{
    spiDevice: "/dev/spidev0.0"
};

const msb = 0x80;                                                                       // most significant bit (writes have msb set to 1 to denote direction - reads have msb == 0) 


let registers =
{
    ProductId: 0x00,
    Motion: 0x02,
    Surface_Quality: 0x05,
    x28: 0x28,
    POWER_UP_RESET: 0x3a
}


let payload = 
{
    POWER_UP_RESET: new Buffer.from([msb | registers.POWER_UP_RESET, 0x5a]),            // Write 0x5a to register 0x3a 
    POWER_28_FE: new Buffer.from([msb | registers.x28, 0xfe])                           // weird one - this is apparently required in the power-up sequence but register 0x28 is in a range of 'reserved' registers - no idea what this does basically
}

let pins = 
{
    chipSelect: 8
}


// --- initialisation -------------------------------------------------

var piSpi = require("pi-spi");
const Gpio = require('pigpio').Gpio;

log('init spi device');
var spi = piSpi.initialize(this.config.spiDevice);                                      // initialise an spi device

log(piSpi.mode);
spi.dataMode(piSpi.mode.CPHA);
log(spi.dataMode());


spi.clockSpeed(1e6);									                                // 1Mhz (one tick every micro-second)
//spi.clockSpeed(0x0001ffff);									                            // 131071 Khz (one tick just over every 7.6 micro-seconds - min timings suggest to me that clocking down may eliminate the need for delays waiting for the chip to ready data (way simpler than delaying between operations))
//spi.clockSpeed(0xffff);									                            // 65.535 Khz (one tick just over every 15 micro-seconds)

log('open gpio');
const chipSelect = new Gpio(pins.chipSelect, {mode: Gpio.OUTPUT});
chipSelect.digitalWrite(1);                                                             // chip select high puts ADNS-7050 in high-impedence (I'm not listening) mode                      


// --- end initialisation ---------------------------------------------

async function go()
{
    /*
    The ADNS-7050 does not perform an internal power up
    self-reset; the POWER_UP_RESET register must be written
    every time power is applied. The appropriate sequence is
    as follows:
    1. Apply power
    */

    // 2. Drive NCS high, then low to reset the SPI port
    chipSelect.digitalWrite(1);
    // delay?
    chipSelect.digitalWrite(0);

    // 3. Write 0x5a to register 0x3a
    await writePayload(payload.POWER_UP_RESET, 'POWER_UP_RESET');

    // 4. Wait for tWAKEUP (23 ms)
    await wait(23);
    
    // 5. Write 0xFE to register 0x28
    await writePayload(payload.POWER_28_FE, 'POWER_28_FE');


    /*
    6. Read from registers 0x02, 0x03, and 0x04 (or read
    these same 3 bytes from burst motion register 0x42)
    one time regardless of the motion pin state.
    */
    await readRegister(registers.ProductId);
    await readRegister(registers.Motion);
    await readRegister(registers.Surface_Quality);
}


async function writePayload(paylode, name)
{
    return new Promise((resolve, reject) => 
    {
        spi.write(paylode, (err) =>
        {
            log('written ' + name, err);
            err && reject(err);
            resolve();
        });
    });
}


async function readRegister(register)
{
    await new Promise((resolve, reject) => 
    {
        spi.write(new Buffer.from([register]), (err) =>
        {
            log(`requested register ${register.toString(16)}`, err);
            err && reject(err);
            resolve();
        });   
    });
    
    await new Promise((resolve, reject) => 
    {
        spi.read(4, (err, inBuf) =>
        {
            log('readed stuffs', err);
            for (const pair of inBuf.entries()) 
            {
                log(`${pair[0]}: ${pair[1].toString(2)}`);
            }
            resolve();
        });
    });
}



function wait(timeout) 
{
    log(`waiting for ${timeout}ms`);
    return new Promise(resolve => 
    {
        setTimeout(() => 
        {
            log(`finished waiting for ${timeout}ms`);
            resolve();
        }, timeout);
    });
}


go();