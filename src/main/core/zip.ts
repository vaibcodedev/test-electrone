import { unzip, zip, type Unzipped, type AsyncZipOptions, type AsyncZippable } from 'fflate'

/** Promise wrappers over fflate's callback API (runs compression off the main thread). */
export function zipAsync(data: AsyncZippable, opts: AsyncZipOptions = {}): Promise<Uint8Array> {
  return new Promise((resolve, reject) => zip(data, opts, (err, out) => (err ? reject(err) : resolve(out))))
}

export function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => unzip(data, (err, out) => (err ? reject(err) : resolve(out))))
}
