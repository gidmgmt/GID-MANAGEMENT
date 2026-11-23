/*!
 * GID Management System — Start-up screen, OPTION B: "Particle Assembly"
 * ------------------------------------------------------------
 * Hundreds of green particles spiral in from the edges and assemble
 * into the GID logo, which then turns solid. On exit the logo
 * bursts back into particles.
 *
 * HOW TO USE (no coding needed):
 *   1. Upload this file (splash-particles.js) next to index.html
 *   2. In index.html, paste this ONE line right after the <body> tag:
 *        <script src="splash-particles.js"></script>
 *   (Use either splash.js OR splash-particles.js — not both.)
 */
(function () {
  "use strict";

  var SETTINGS = {
    durationMs: 6000,        // how long the splash stays before fading out
    oncePerSession: false,   // true = play only the first time the tab is opened
    allowSkip: true,         // tap / click / any key skips the animation
    appName: "Management System",
    services: ["Structure", "Architecture", "MEP", "ELV"],
    statusSteps: ["Starting up…", "Loading projects…", "Syncing site reports…", "Connecting the team…", "Ready"]
  };

  var LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALMAAAC9CAYAAAD4HkyDAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAFxEAABcRAcom8z8AAAJZaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8P3hwYWNrZXQgYmVnaW49J++7vycgaWQ9J1c1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCc/Pg0KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyI+PHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj48cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0idXVpZDpmYWY1YmRkNS1iYTNkLTExZGEtYWQzMS1kMzNkNzUxODJmMWIiIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj48ZXhpZjpEYXRlVGltZU9yaWdpbmFsPjIwMjEtMTAtMTVUMTU6MTI6MDU8L2V4aWY6RGF0ZVRpbWVPcmlnaW5hbD48L3JkZjpEZXNjcmlwdGlvbj48cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0idXVpZDpmYWY1YmRkNS1iYTNkLTExZGEtYWQzMS1kMzNkNzUxODJmMWIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyI+PHhtcDpDcmVhdGVEYXRlPjIwMjEtMTAtMTVUMTU6MTI6MDU8L3htcDpDcmVhdGVEYXRlPjwvcmRmOkRlc2NyaXB0aW9uPjwvcmRmOlJERj48L3g6eG1wbWV0YT4NCjw/eHBhY2tldCBlbmQ9J3cnPz6PvMT9AAAAIXRFWHRDcmVhdGlvbiBUaW1lADIwMjE6MTA6MTUgMTU6MTI6MDUITnRrAAA3sklEQVR4Xu3d6ZMb550n+N/z5IEjcd+FSlSRdZBFSl7b6vawO7qlGctjdy/VM70xnpmYmY3d2WM2vBvRu61WbGzsvpNe9v+y0b22pLItmqZalklLFG+qSBZZLBbqwp24r8x8nn2RmUACBdSFOoAivhEgEk8+mSgkPnj45A0wzjjjjDPOOOOMM84444wzzjjjjDNKQd0F4xxPKKW7LmuEEO0uG+dgwd0F4xxdKKWIUsouLy9bAGDXx+rqqvXx48c8pZTZC/44vTNeaMcQSin69ttvOa/XG0lkNuYT+dXzcrNpL1dzfowwsfD2it1mK7mEcNJl8W3abK48pZQKgiATQsrRaLSKEGoihNTueY/TP2PMRxhKKXr+/DnP2MjF52uPrsi29PeKzfW5krw5Tahsa6BcACNMWGSvWLBQtNNgAmr+9XqGiwe9554KnP+V0+kshUKhPMMwhWq1Wp6fn5cRQqT7vcbZmTHmIwqllEmlUsHHq7d+InFP/jJZfvJHVZSaolRlAKuYoYAQBowQAACiLAIKwKoAWGVUp2SpnF+S0557U/4371itwrbX6y0Eg8GsxWLJBwKB6riV3jtjzEeQ5eVlC7aoby7nbv3H1fLvf5JX1y8AVTjAFGMAwAgAIQAMqDWMkF4OCAAQZSjTxA1f0lZ642u7fO5zh93/wul0Fr1ebyYajaY9Hk8ZIaR0v/c47YwxDxBKKXr69Kmj1Ej+i5fKl//9q9IffiJDVQCgDIAJ7T5AIwQABBGkChV76Y0/WGoXP3ZZ/C/tdnt5cnIyJQhCKp/Pl9544w15vOWjd8aYDxlKKcrn8+7bD3/9bzf4r/677cbjK4Qqlu56BwVNKaIMsVX4/Jt/sFQufOrgPCtOp7Ps9/sln8+XisViWX3lcAy6K2PMh4gB+Q/ffvYfVsmv/ianblygoHDd9YwcCrRqq3D5y1/ZKhc+dVj8K1artRYMBqVgMLgtimJmDHpnxpgPGDPkF+RXf5NX1xaMbsVuGQz0pU+dVu9Li8VS9fl8+UgksjUGvTN7fgnjtNMNWdIhH6hF0CtrGzW0f8zTI6MMASJI4aglHyIE2UnNlmGQpawoCgsArCzLisfjaXz00UfjrRx6xnsA95l+kAEA9ts0Uqo9CACQ1jBtDVOqlwMFSgEQokhlaoLsWbpSt7+4Wq+Xo7VazSpJkleSpPDm5qaTUsp2v8/rmjHmfWQ3yK065he75LCgm+6lf1a1vPiXMpEDlUrFks1mvZIkhfL5vIPSvbs5r0PGmPfIfiAbOVbQbMVR8z58p8I+/zEhcqBcLttzuVxwa2srCACW8fEcY8y7pgX54d6QjRwbaEyxyhV8Nffdf1lkn/+E0mawUqk4JEkKbG5u+iml/OsOeoy5Tzogw6/+JqesLdA9IBs5TtAKl/dVXXd+XGRXfiLL9WA+n3dvbW1FNjY2Aq876DHmHtkB2WiR6QGgdhf0ySCg83j5L1S1GZYkyZtIJKKvO+gx5q5QSlEqlRKerHz9ww7IrQoHgNpd0CeHB/3Nj/N4+S/q9crEGPQYc0cMyCvbT374rPmbnZBbFQ8AtbugT8agB88Ys54OyNVP31+v33+7J2QjIwBa38rx2nzHr9Uvt186IJc/fT/euP82BYXT9sbtEbT/hbjvegfd9U0QYWVPzl7842secuHX+vHQUjQaTbxOx0Pvd/me2fSDbIwfVdA8b0s4HI6Cz+fLvi7HQ+932Z7J7IBcv/82RTuPfhtV0BxnTQuCUA6Hw6lwOJw466D3u1zPXFqQN7Q+cryut8io91IZJdCM7M7Z8t/7nG+cuyHwzjWv11t6HUDvd5meqZghL1U/fX+jprXIrYUx+qApNO1FLvvGTad6+ZPXBfRrs6ZrpANyRYcMCtexdYL23gRBe5TtyHBs5UDAV11N39Kfl5hnf1VplqYlSXImk8lQMpmM6Acnnbmj7fbbOJyJdENe726RoatlPQMtNG0KZV76zpdO+eKZb6H3uxxHPjsgV00re93wRgA0EIB6BaBRA1BlAKJSQBgAIwQYA3A8AqsFgcWKqBULZU76zhc+9J1/tCBL4qyC3u8yHOl0QC5pLTLRIbdQdsMbQtCUAsgNgJJEoVGjUCsD1GsAqgJACAWEEWAGgMEAPI/AakNgswM4HJjaWXvRX/+j6x7u0uJZBb3X8jsToZTabz74/N0n+cW/W6+2IRuffthBUwBQmgBSikJJIlCSAJpNChS0lhgQAMNACzPGWuvMMNqD5RA4HYi67c58lPzxtaBw+ReMyuTPGuhey+5MJR6P29K5V//8Tv7T/3OjcvcdVd+zZwYMQwxaVQGKGQpShoCUolCvai0wIACMATCjwW09Yw0zwqDB1usxLADPI+K3u7NT3J9+GhTmfnPWQO93+Y5k4vG4LVVYf+e+9Iu/WyvefZcY25F1gMMMGgBAaQAk1glktgiUiwQo1Vf2zHB3YNaekT6+/YwAYwocg0nQHkhOcn+8OGGbv4YQKp8V0AdZtiOVeDxuyxbib3+T/fiDtVIbMoJOvMMImhKAWhlgO65CMk5Abmob8TSwWlcCYQBGb4EZBgFi9BbYaJVNkFuYkVbGYaR6LcHtSfjBLyY9s1+cFdBncjtzC3Lm4w9eFe++q1CFo2DaBqxv4DW20Wov2mXG647twCe0HZoSgEoR4NVTBTZWFKjXiLbtWP8RGD8YpP+gzM/GsPl1qz7QVrmKKJNTMpEN9e7V7dLKO5RSx1nYDn3mMLch//yD1cLdd1Wi7xAxQR5W0JQAVAoAa88USMQVkJtauYZUvx5dC6n2uvUA0LYv9/hPo6Neqy5hCyglrstnB/SZwhyPx21bOuSX+fvvqlThqIFuyEFTAlAuAKw+U2A7roCqdra2Zoz6+l8LdXfLvAOvuUnvGFTZIk6JG+RsgD4zmFdXV61bhfjb95Iff7CSu/+uQnTIBq4hBt2C/FRrkVXFDFFrbbEJagssdJb1Qm1uqluvO6ZT2RJKiZtwb+RBnwnMq6ur1mR58517iY8/WJXuvasQtd21GHLQVAUo5ymsLsmwvSaDqtAWYmgB1OQZsFtAO1Dr3RB9vFGudT1MXZL27EzzJxpodO/qdmV0QY885hbkrY8/WMnda7XIlKI23CEFTYkGeeVbBbbWZCCKhri7ZW3haw0bODuRggFVG9Lrt1f8jPH6KL2uXhurbAWnxO0RBj3SmFdXV63J/OY7dzY//uCFZIZsPIYXtAYZ4GWrRdaQganl7NvFMKHUyjtXBtt1u6X3frSgY5Wt4KSYYO9dTY4g6JHFbED+ZuvjD15k772rqHJH12KYQVMCUMoDrDyWYfNVdx9Zwwkti1ohgjZcA2A33s5hvbtimDXKO14bitvTAlbZCkqKyREEPZKYDchfb338wfPc3XcVVeEoQUB1mcMM2oD84pEMG6+aoOgtMkLaTg2M2697gW0/6+N1gwD6ONNr87ZlAKqVm+djft2aBwKECVtmkmKSu3c1WR8d0COH2YD81frHH7zI6JCpdlD6sIOmBKCUA3j+UIPc3SIbA6iFumvbcruK6dHVbzY0d5UbLXpLul53x3yNeWCVrbBJMcmMDuiRwmxA/kP84w+WM3fflVXTDpEhB00JQEnSIa+2IWutcdcOEF0VMqHUXmsSzTDb40w4TdNqE7ShtuHq8zL+QcYfrD8jrQ9dZZNiih0N0COD2YB8c+3jD56l776rqgpHiXa6UBvocIImKkBRAnj+QIb11aa2+U1H2d0HBgMb9MK5E60BcUc9/S9o1THNTxvfOc543XpvfcYIq2yVS4pp7t7V9JCDHgnMBuTfr/78g2cJrWvRQjzkoInRtbjfhPWXTVAU7UALMz7toQ20Qeq7pk3wOh4aNcNyR3bU74LbrmQqR1QvMJ6oXqZ1OWp8Skzyww26ezkMXZaXly2VRvZPf/P8H/7vZ4l771JQteORsfZFtDZb4c5NWK2+JKY7Wr/2o72ChPQl0f5y2xCM79hYWub65jLjtTFICUA9zzSzK65MeoMoqkIBa3dAQU3SsOdlyYMxMDsO49SPjmOwdrgnYxz1ph94j/SzSVrHLe9xlBzWl5X5cFCEtOOdjXKEKGCMAJBx+lV7GQA2Wj1GsavhjVDt+4tBa+fRdpFIJOl2u8sAoJzWTYOGGvPq6qo1X07+6e9ffvp/3I3feg+QfhhnC6q2sIcRNKVAuKorX1+bfFjbZrcx5hoAGgxEEaoqVXu+kg8RixLbriVECjLfOsTTOKzTDLx16KeBWi/rgtzGazqu2Vg2rfFdyw+3lxFCFMD4ISCq/b16ufbxGMWmhjfC1e8vBnTQLperHA6HM36/PxMOhyWEkH6I1MlmaDE/fvyYx7z61her/+//c2/lqx/X5abNWPDDDpoCELbukSzb87fYaugug5gCx3FNirVOCSIIUUSR3JBtxVrx/HZl61KqsfGG1MgHmNYxyzpGvRVGGPU8NcoMuBOx1tKiFlZ9OTH6MtHrAwLABmS9jvas4+1antpnZBSHHN7w66AxxhWbzVbzer2SKIobkUgkdxrHQw8lZkopt/zq2zdub/78/7r57Iu/Lhcadq2F0L+QIQZNAQhX90iW7bmbfCN8x8rbM3a7vWSz2Rqqqnb/98vUGjV7tVoNvUg8f2u9tvrPi0ouaGBuIe3uhhitK26fGmWcSaLB1UHrXYd2a92ergOueXm1hvWdLtj0uc3LhzKK0AO0KIrJaDS66Xa7SycNeugwG5DvZ375t394/tt/l96uCWCgGXLQFICwDY/Eb8/dtOqQHQ5H3maz1TiOU1iWVTHGMsZYW6+kFKuqytZqNXsmkwm/TD7/s9Xmix+VGrngXqdGtaAbGLvOMGGQ3qqasJrrGcuwtex0/K3lpHcxtBNmNdgA2g+ltTOGMoq92QZtdDmi0WhSP2OldJJXHx0qzJRSbnVj+fK9xC/ev5/87U/jKzVns9Fjwet4hgk0ABCu6ZH4RCdkQRCqGGPFZrPJdru95HK5CgzDqBynnfxSr9fZer3uSKVSwa3klriytfzOhvziR3lZCqI+p0b17WJ0r/R1INYhdo1vAcbacunoUpiXpams9fkRABCthfbVvr8Y4NsrhYFAYPvy5cubAFA7qRXC/hfTPuFQSrmV9acL9zMf/+1S5sa/S2VqQkmiCKix9Nq4TIDaZa1KHU/thd+K8Y3Q1hFjneksbYE2lXV8odpWOMI1PJIluRMyx3EKz/Mqz/OVYDCYiMViiampqXwgECgGAoFiOBwuUkrrlFLgGI7wwOXlKiUKrocbtCa0ugw6VAMzMvWFjR96u7vRC7LWympo2/WhtbKnfVjjB2/u1rU+qzHOWIQAAJhigqsOhSmFad3StDPebUIIUEoxwzCK0+msf/jhh+Sjjz4yL8FjyVBsZzZa5EeZT95/kr3x76uNmqOQBkxUAEIpUKJtzyX6s/HaKNO2DRvbl/Vyqpcf83ZoQnXIqd6QMcaE5/laOBzOTE5OZvT/eiumRzkWi2XD4fBmJBLZnpycWrsQvfR5jJ+97uF86RaoFqz29ueOdNTRH8aAqY6GUO82mKBqP+7OtH7WxpOpgTXXVbHK1vmkKNnv/2Whuf1WsVi0VatV10nfBevUMRt95HuJX7y/lLvx7xtqzVGUAOpV/cKAZHhBEwqE3wOy1WqtRiKRpCiKxlnPansuQBFCBAAaU1NTOY/HszE5Obk+NTW1Oi9euhHjZq+7OV+6u0tkDHcAbuk1jTehRnpBqx4CAAM1GF0rfUeJMVr7ybana82wPWzMjmCVrVtSYoa/95e58vr3jdsin+Q9Vk4VswH5UXrx/aeFG/9WhppDVQDyWQpEbSMcRtDUgJzeH2S3213st3aPEKIIoebMzExuenp6Y3p6Oj4txlbnxUs3JrmZ6y6LN23g7QZslLd8dWMzjW+BNGalv9aetIqoNZ02UWsS88RGUdczYWS+KqxdLPuf/dW2tPJWvV63nSToU8NsQH6cXnz/WfHzn8qo5qAUoNkAqJYIEKLjHULQhALhax7JmukNmWVZ1WKxVPYD2YgOWna73cVAILAliufWp8XY6vzEGzdEmLnu5bxpo4vRHQNm62F6DYZD/dEepnqB8WTafW1O6w1NrXRryFSqFxJGttQd6wtl75N/nci/+P5Jgj4VzJRSbm37+fzjbBsygHZATjlPQZZ1eEMImlAgfL03ZJZlZZ7nZYfDUQiHw4n9QjYHIaT6/f5KG/T06vzEGzfCZOa6h/WmDZDdDzBWzkx4W6h1aZ3jjfqdp1UZuDvwGi10a1z7uTWdKRQ3LTVh7VLJ8/SvTxL0iWOmlLKJREL8dvvG//Ks0IYMxnXVJABKTP3lIQJNida1sGXnbtqavSF7PJ58MBjcFEVx+6CQjXSCFtdFHXSQzl13M+0uh9YVMKQZE/d+mCHvNKmVIH0Qaf+YgLffwPxWetu+cwQAECyfOOgTxWxAvrv5q589KX/2H82QATTElRLR8Q4XaEKB8E2PZDcgW3dC9nq9hWAwuLWwsJDyer0DXeKqJ+jwwo0AmbvuZIytHMapUag9bMKqvTYU6yYRtLsTeiWtXGuhteLOVtncSmuF7fkbr02jWq9PGvSJYTZB/l+fVj75zxVFCnXXIQSgWdcuRzVMoAkFYml6JGtub8gzMzMZAKgfxZ6vnqBDCzdC8ux1J+tLgwGvhfYAp0aZx7XKTeDbldtAu9jtR+FJgj4RzN2Qy4oUBtT7AyiyDndIQFNKCS97JJs0e9Mh7xsy6f5cvUIpxZRSxvTY8X30Aj0TWrgRaMxed7O+dh9aq7sTXcd402gEHduW28/aULvVNbXSraGutrrr/bqjrRQeP+iBZ7BX9oSsNYAAVLtg4L0vZNMuWtNu6o5dte09Wa0yY+/WEe76BgTEorglV3nuSCFTStHz5895q9UaYBimgRBClFJqt9uVzc3N6htvvCF37wKmlDLZbFbIZDLRjY2N2MbG2vmXmac/LAovf1SiuWBrl3ZrGWnLrLU8Wnv+jN3XPY5b3m33NdafjdemZ0NR63VXjB8GJlzDWp5+4swv/DzimbtntVprXq9XikQiW6IoZhBCze7PfZD0eOujy56QoRszhbufy9qXcMqgNcgeyVOavekgkSOFnEqlhOWXT95++PzRD8+Fpr9yCd5NnucVq9Xa8Hg82ampqRwANLvn1wv0K+npDwu2lR+VkRTcc/c1bh/SqR1I1H3csv4A83LS+9JdiA2g5v/b98IMxwy6x1sfTcyQn1U++c+lXpDBhBkAqiUKt6839S/h9EAjBMSqeCRP5XggP1p+9MOPb/38b59tPnvrzYk3b70ZffOXXrf/ld1ur7vd7kI0Gk1wHCeFQqFq93z7gS45Xv6oArlgC6tp+exYDlgD3BoGAznqOEIOG1D1ZWcMA3T86Fsxo20X7kSGCdewlaefOI4Y9I4+2lGkG3JZ7QO5KwgBMCzS+8FaX5gYfeUT6kMTAsQqeyTXMUL+xc2fv39/9f47lUbZ83jrwTuP4nf/m1QmNV+tVgVJkryrq6uThUIhDADW7r5krz70Oe/CDVd55rqAfGmkL8eO3ddgoOvefd0epw12b8XoAqvX64W2RxFAn3KKtT50+Yj70EeO+bCQQV9IFivWAJ8CaJUCsSseyVmZvek6RsgPXt1/m1CFwxhQg9SFp7mnV56lHr+XyaRm6vW6rVgselOpVGhzc9Pf64vtBXrau3DDVZm57mBMK4WmqcwItSdNKdIH97P7GnTu7Tqd4w4ScgygjxQzpZQ5LGQA7eBzwYnbgE8QNCFA7KrWIrvpSUDWT4/CgBqkJjzLLl15kv72vUwmNaMoCr/XUWc9QbsXbjiKM9cF5E9rlXSTCAbffd3dXej+Vrtf9ykzFxmgK96jAX1kmCmleCO7MXF/65c/OwxkAO2OSJ4AauE8KdCEUmJXXZKnOntTQKGThKz3XxFq0prwIr90ZTn37XsZKTWzn6POeoJ2LdwQCue1LodeWwPdf/d1q7w13zbgbpC9GuweRQC7lJtDsWxpONcu1X1P/zqRfzkQ6CPBTCnF69n1iWeJ3/7s28rioSADaCduunwAVjs+SdDEprolb2P+poBCdxxWx0lDNlZyNdCFJ1eWsxro/XyxfUFL5687qL6nsGtnin5EdLtM+8cEvP0W5jfr28Xo9U33KusVpPehnfFLjcCTgVrogTFTSnE2uz7xdPu3P7sv/eJ/riq5yGEgA2gfjLci8IdZIIQeO2hCte3Ivub8TcfpQja2yqAGrQmrpadXnkuDgY65Fm7YCuevCzSY7oZnPm5ZS/eKX1f3w+idtLB3jOqZXuX9yhAAAG5aGo61Sw3/839VqKbnjc+dTqcn4vG4DwC0G5HukoEx5/N519Ps1//pYf7j/1KVpQg6LGQ9HAcQjCLgeK11Pi7QhAKxKW4pIM/fdOGhgGyc8oQapCaslZ5eeTkgaFFYuGGVpq4L1K+30NDig/TBVp+6PafWuG59A32xPYJa/1PowU2L6ohfqgjLV+v1esjoakmSFN7c3HRSSnc9zW8gzI8fP3bcffZP//pB9v87EsgA2pfq8iKIxNgWzKMGTSgQO3FJQXX2ppsbKsiAtG3hqElrQrz29MrL4rfvZaTMQKAt2fPX7RBM73ZqVLvV7Vrx09Mq7UbePcN+ZbtF7+ogACBM3dpwPXurzLz8s0ajYa1UKpZsNustFot+ALB0f2ZzDo15eXnZQlDxT17CL/93qbk1exSQjXAWgIlzGFwe5jhAEwd1SSF57qabiwwhZH08A6hB68J67dmV1dLSe5nCYKD51NR1Owml9+5iGC/az6h7XHtUz/Qq71fWeug7azACRNmyo2x//Gd1uRhTFIVrNBrWQqHgTSaTzt3M9h2xWyil2OVyTT5tfPa/ZZsr3wPYvfk/aBACEFwIYvMc8FZjU92RgCYCuKWAOnfTzQ4xZL0cMVoLvV5fuhIvDw6aS01dt6qhNAIdqS6pNTEydTGMoq7nnioPEXMXw3gYfwzClMFCKaRapO82m01eVVW2WCwKpVLJudsFGg+FuVAouJel3/2HeOXrvyBU7TvzQcKwAMFJBJMzHLAsGhg0oUAE4pLCdO6mj43ccTiOBrIe28NnD//FkULWyxEDSIGaED8q0Mmp61YS0g8f1SdpTbmPLoY53a/7lfVIC3Drn9Zfo71iGpY6k5iWZdmiqipDKeXL5bIjm83u+KxGDoz58ePH/Or28+8+lX7xPyhUu9rQcYXnAcRzGKLntBXZw4ImKiICcUlRdPSQ4/G47Xe3fvfOp384BsjGcRY66A35yZWt2pOBQfN6C93dxTC50gvb47rTowigT3mvMiPIeG/9fY1hCggrtGpvNBq8qqqMoihMsVi0q6pq7+e2Z+FuCQaDvs365/9jXt2c6R535EEAFjuAOMdAMKr9B3BQ0ERFxME4pSg7d9NnmThyyKvbq+/8w5f/8P691QfvHAtkox4DSIWqsK4sXdmqDwY6al24wSdNXQ6tYnua1tAu25YHyM4uhn7x9e6KoDLNZpOnlGJCCG42m3ylUrH0rHpQzKurq9atzLM/eVX93V8ddT+5XxAGsAkA0xfZA4MmKiJO1ilNsvM3g0cMmVLK5Sv5y//4xT/+3b3VO+8eK2QTaIVWhU116cpWY3DQXGLquk3Vuhz9ti2bX3ek+3Wfsh5FbcSt92jXMsoxwgQrQo0QggghCLRlzjAM09fdgTDb7XbPhnrz39RJxds97jiDGQCXD2mgJ/YHmlJE7dheiDHzN0PWI4eMt7a2Jn5985c/u/fyhCBjHRjWWugEWbqSlJ+8lykdHvSEdeEGsz11XVDaK4Xd+kwNdrusu0BPv3JzdtTp0cVAgIA0uCbbiKxwHKcCwL6+l31jppSy5XJ+arN274dHuRluv8GMtv15v6BZyjWm7LMPQ8LRQgYAkCTJ+eXjf/rpbx/85qcnCtkowwgpUBO26dKVVHNw0Gh76rpNMVYK2+nbxej17fcq65UOtL0fVOZkKokrjZLtJcuyTZZlVUopxRgTQkjf72nfmLPZrD2nPP+TmpyJdo87qRigp/YCrSJiA7sU4EN3LRZL7ighU0q5lfjKwidffvw/VZoV74lDbp9UgBSoCUnQQEtHCBoMaMaUpjn0M9urvF9Z62FC3RqrcDJkzy/XN4J/wARLPM839KumEo7jGoIgNHb2ibTsCzOlFDUaBc9G+e67FO086fIkgxkApxfD1Hx/0AzDyBHr5CrPWhIOh6NsXB95UMgAAMVi0fVg5c6/WsuuXUIY0KlANupiQDLUhDReurKtDgia7wLdB+Mg2YkXWr8chABA5mRIzz2pvgp9iVXHit1uL9rt9jrGmGKM5UAgUAiFQuV+3Y79wkSZYtmdbjz+Z90jTiMaaART8ywEeoBmKdec8Ew+t9mEit1ub10yy2azVd1ud+KwkCmlbEpKTf/T/c9/igCYU4VsDDMIyaguZNDTKwkyIGhu4QZsTV23yaH0yey+bm9bBpmTcXZmqbYe/pIhzhdetzcrCEKZZVmZYRjFZrNVwuFwHgAa/U6p2i9mBojsqdFsuHvEaaUFeq4HaFltWhhL3G63V3mebxq/bK/Xmw8Gg7nDQAYASKVS1uW15bfWc+vzQwEZm7ocuCpk8NKVFBwNaLvcbqFb9bsL9PQq71fWehifATTIKDu7VFuP/J5V7asGZJ7nmyzLqjzP17xeb87n8+UBoO+FdfaLmaN8PUrRvuufSPqBVmRKgOCC1WptsixL9Cty1n0+n+T3+2uHgUwpRbVazfnwxZ13EAJmaCAjMC4bgFRcFzJ46UoaDQ4abU1dtzVDnYePDhAzXu2hNa5U4WScm11q6JDdJsj6GevViYmJ1NTUVAohVO/XKsN+MVNKGQUX/d3lwxDMADg9OuiIDpoCMAxDEEJEXwumgiA0nU5ndbdf9l5pNBq2eDJ+aeggG/UYilSmJmSZpStpvPyeVDk86LDeQlvNLXQv2D3KehS1ELf/QVrXIrM75K4rqe56lah9YQbtl7TvuicdDTSGmAm0OVQLIYTsujD2SrPZtKTKidhQQsbGpQMQUpm6kOMeXcnC4KDRuga6F1DoA3e3IND/dpmTmezsUnNz35D3bISGFuhBgxkAhwdBbJaFQIRHPM9ajHFID8Z4kM+L6vW6rVDNB4cWsnGeH6ZIwXUhy397JYefHBloc11tgu6C3mn9zUjHLHMykztayHAAzEqjyCW7C4ctBujoPLZV2Mz3GYbhEUKIEILK5TJfKBRsA9yUCKuqyiMEeKghIwqAECAMSGWqQo5buiIxxwO6l+V+Za2HwslsbubIIcN+MSOEFKTathnK17vHDVswBrC4mraS+8mfZ5trf0IptSmKwtTrdaskSb5CobDrMbG7hWEY6rI7paGHjEA/2J0ihakJOX7pisQO1uUIcQs3UHwn6L1i/N0AAKBwMpubXWpuThw5ZNgvZgCgFmxpWGl4q3vEMAYxFDd5KZTm7/9lovzibUqprdFoWHK5nD+RSITz+bzjMKB5npfDztDmSEAGff56H1qyfHu0oHs1wbsEqZzMZWeX5GOCDAfADFaXo+aEmWfd5cMahAlbZtNikr13NVlZeYdS6igWi45kMhlKJpORQ4CmFoulOuGZfDUykI3xmCIFVwXJ+uiKxC6/VxgU9Nr0b62yVzLXBe0td6TVtcjOLilbxwcZDoCZeuyekpLxf4Mpe6g3OpUglS0zSTFhAi1JkvOQoKnf7y9Oh+YfjhRkfbMswhSpuCYUbFoLPQjosOXC5878m1+yxF411+0OQnqLnJtdko8ZMhwEsyAIZTcz+dAiT611jxzqIJUtMSkxwd67uj0YaMqybNVn9T1xW9xZDeOIQNZ5GiuFkv3RFYkfBHTspZOc/60988ZNVrX1BY0UTuZ1yNwxQ4aDYHa5XI1IJLzuqn73c0SZgd70xINUtoRSYgIPBtrtdssOu3tzzv/G3ZGDrM8TkLZjRbI9upI/JOjJyem4zxl65pEv/FpIXb7FqrZqR2UDstSGbN5FfRyQYb+Y9V2ITb8/nHCh2E1BPr/SXWfog1S2jJODgiYulys3YZv6vYt350YOsl4PMCDC1ATJ/uhK3nJw0KFQaPvcuXNxrzP43KVc/ExIXb7FknYLjRROtkhaH/mkIMN+MetRPB5PPhwIPkWJ2Wus4ip2Vxj6IJUto5S4DfeubpcOBlq/6aTidDpzE/7JR/Pe79xkGVYZOchIX1FDoLXQhwDt9XoroigmRFHc8Ln9L5zKhWv2pAa6BXnzZCHDQTAjhIjX660FAhObYWHmd7bsd36HVb7ZXW/og1S2jFPiFj44aABQvV5vQRTF+KRz7vNJ+8xTA+VIQW5NB4jgmpC3P7qStx4ItOJyuUqiKG5OTIjrHnfguVO5cE1IffcLS+7CA7IV+ZKjOyFzHFfz+/2p44AMB8GsR3G5XJIozrx00wufCaU376JR2rphRG+hNw/YQiOEiN/vrzudzkQ0GF2a5C/+OmydfjGSkI1hrLXQhQOCBgA5GAxKoVBoQ9RBu9S5zyy5c9d56npphswwjMqybDMYDGZnZmaOBTIcFLP5ywz7Jp8K5Yu/EvKXH2B1hEHTuwcCDQDy/Px8XhTFeCx47vYkc+GzEDu90kY7QpD1YYQBKWxNKAj7B23cvH5qairXAu3wv3Ja/U/dbndHi2yxWBo+ny8vimLK5XIdC2Q4KGY98tzcnDQ5ORn3OyfuOcoLi47S6IIuobS4QfYPWl8ZrsdisaQoimtRT+z2BDt3LcS1QY8S5FYdBEhhBgMdjUY3gsFg2u12F3meb1qtVtlqtVZDoVAqHA5vBoNBCSEkG9MfdQ6MWf8A9UgkkpycnFzzOSYeOsoLi87yCIOGlLiu7B80AKgOh6MUDAa3IpHoWsA9eTsMc9eC7PTKKEJuFesrhUXH4UGHw+Ftt9uddzgcZbvdXvL7/am5ubnNWCyWBYBjXccyfZSDhVLKJZNJXzwen9raWp/OlVP/Vdnx9GrJsfRdlVG6v3yg/c4PoKZTban+AO2qncg0HTWNJ4C0CsZ4CgCg3aUKiFEXaVUI1esDaLcQRtrVjoxLeFH9Ml6EUVwktBHDby1OeGa/QAiVvV5vKRwOp8LhcMLj8XTcC1v/QoUnT55ENzc3p9a31qcypc0fZJmVH+fQq9lRg2wUAQKgFCir2iqu8ne+8tQvfOoWAi/3ur0ZpRRRSvlKpeJOJBIuRVEYhFAzEonk3W536bi6FuYMghlRSvl4PO5LpVKiGXTRsfRd0gV66DFTAKqDFpm3Fif3B7p1T7719XVxfWt9KlPZ/kGOe/5jia7NjiJkI/sAnUMINcynoOk/cIZSygEA1s8Mkfc6Q+SocmjMcEDQo4EZACijuOjgoCX++Y/zSAc9YpCN9APt8/nyoVAo43Q6s16vt9wDq3lu/b75I0+Pj3Cw7Bf06GAGIDroKfbwoHOV7R/kLCs/LuDV2VGEbIQCUE61VZylNmie5+sOh6MSCATSwWBw2+/3lw9zkvBR58ArgN3pXgGIRmNrPkfooaO8sOga1ZVCUNkCpMQ1+e7VzfzeK4Xm4xZisdhGLBqL+4SJ277G7DUvPb8yqpABAWB9K0fJ2V4prNVq1lKp5MpkMsF0Ou0DgF7boU88A2OGswyapsRX8p2BQHvk2WteOLcyipBbb9EB+vl/LctyqNFo8IVCwVEul0Nra2ve/dwN6rhzJJhB+zJ3B01GFDRJiavNAVpo68Rtd23+mofoLfSIQW4VGaCFpz8ooJd/1mw2eUVR+Gw26y6VSqF8Pm+n9HTP4D/SN98T9Ki20CQlvqzdubpxSNBea/i2pzp/zaWe07scowXZCEKAVL7ozFof/3mpIZ2XZZmt1+t8Op32JBIJj74V49RypJhB+zJ7gnaWFxZdldEFnacpcbV299Cg3fbwbU9l/ppL1lroUYNsBAFlqC03UeHX3lYUxYoQYhVFsTYaDW+xWDzV1vlY3vjMgiYp8WX1ztWN3CFARzTQrvL8NadyfmU0IWtRmYa1Yll5s96sTsiyzNZqNS6Xy7kSiYQHAHbsMDupHAtmOOOgn1fvDgTaWZq75lTOr4wiZO0FxWCv+pqW3JuNRoOjlGJFUay1Ws2dyWR2vfHkcebYMIP2ZZ5J0AWSEp8P0kJbw7edhblrLvm8fizHCEHWQ9impYhWFxRFsVBKcbPZZPe6G9Rx59jf9MyCVlPicmUw0Pb8/DVXc6bdhx4RyAAABBSuDNsTtVrN0mw2WVVVUbPZ5KvVqnWXyY41x44Z9gAtjChoCiqbV3TQmcODtuXnrjkb2jmVowIZAAAzFDHWpgAsCRBCGIQQUlWVq9frlr1u2H5cORHMsAtoT2Vh0THCoCU5JT6t3LkaHwC0tTB3zdmYaYEedsjG38hZONYusD79Pn0IAJh6vW5Lp9OnsonuxDDDGQadV1LicvHO1VfpQ4Lmw7ft+blrDqPLAcMPGQMAgxAARq1WWFVVJMsyx3EccxorgSeKGfYCXR1d0JKaEp8XDg/ayYdv23Nz14TmzMooQMbGSuuOOr1KTyYnjhn2Aj2iewoN0MsDgrZl5q4JjZmVHXjNw0MAGSMAAJUoDVTprntaORXMsBvoug56BI/loKCykpISn+W/ORLQwwwZUUShztab1Wahu/5p5dQwwx6gXeXLD9CIttA5WQedPDxoa3rumlDXVgqHDTKDKDCUU9h6KFGvN5sYY227onYNa6KqKkGmU6pOKqeKGfYCPcIrhdlmSlwqfD0waGdd73IMEWSMEWDKNa2NqWWO42SGYVSMMdXvtdjw+/2n8p2dOmbYC/QorxQ20uK3+W+uriafv6NQ5VCgufTcNUdNXyk05VQhE0Sg7Mg2JOsKx3ENjLFCKaUsyyqCIFRP4uTVXhkKzLAP0DCCoAmobK6REr/NfXP11faLgUA7K3qX45QhIwSAFGuDzZ9fUpokZ7PZOu5tbbVaq/1uB3zcGRrMsAdoT/XyAzqCoClV2VwtLT7J3j0S0KcNmaGcAsWJeEPyPLLZbFWr1drAGFOGYRS3213c7d7Wx52hwgy7gPbWFxa9owoaqWy2nhaXModvod18+DaXmblma0z3v9j7MUPGBAhU3DmSmb6NFC7hcDgq+r2tKc/zTafTWQSAjutpnGSGDjPsBrqxsOitXX4A6ohd7BwACFLZbD0jfps+HOhoJBb3sLFvuM3zv+l5x6djhgwEU6i7CvLGua9Q2fFMEISS1WqtMQyj6jdqL/l8vtIgd8AdNEOJGfYA7auNaB8aqWymnhEfpL+5+vIwoKPRuJeb/tqdf+NLTLhGa8bHDhlRVrFVaeLCXVoK3eE4a87hcJStVquMMSYsyzZ8Pl/e7XZXT/OSA0OLGfYA7W2MKGhQ2Vw1Iz5MHRy0KIrrExMTrwQ6/YW7/sZDrcLuUOGIIKub83eIFPraytozgiAULBZLHSFEWJZVvV5vKRQKScd9Lbm9MtSYYRfQHh30KPahCahsrpIRH2x/c/Xl5ot3FGX/oKenp+M+b+CZrXD+t5zqKuwGFY4M8oU7JBf9PY/tmw6HIy8IQpXjOIVlWZXjuKrD4ci5XK7KabbKMAqYoQ/ogA7a0xxR0EhroR9s39Za6AOAnopOvfLaww/9ysXHnXPtzGCQMWVlZ2kvyOFwOBMKhXIIoVNtlWFUMMMuoL2NC4ue5qUHdERXCjO1rHh/+/bVFwcAHYvFEuLE9EuuEPsdQ/h239mUQSBjAoSpu3PNV/M3uyGzLCvzPC87HI5COBxOiKJoXK7sVLZgmDMymKEP6JAj8tBbvziyLTQFhc1U0+LDrf2DdrvdlWAwuCWwgSU7DSc65zg4ZFT3SY1XszehEPmqF2SPx5MPBoOboihuH9ctHQ6TkcIM/UC7Ig+99QuLvvrlB3QEj7YjoLKZalp8sH776ovt53uCBgDF6/UWJkLhLTed7bgF9NFAnrmJKqE7Fs6W7obs9XoLwWBwa2FhIaVfAXRolvfIYYa+oCcfeuULi77GpZEErYLKpmtp8W58X6Cp1+ttBAKRpIc9/8iYx1FCtrL2TD/IMzMzGQCoo52Xsj3VjCRm6AF6cnLyZdQn3vEplz7xN0azhVb1Fvpu/Ourz9f3BC37/f6MRXY+hROArHctzJBPdctFr5zKWbRHlY8++gg+/PBD4na7my6Xq4EQU6cyqisVrgwUuWsoGwJEMAWkX7QZOr92o8y4RrT+ulXVNI12nWhtWuP0to5rTlPT9OZnqr23uaw1nT6NeRyhBNcaNUe+lg9bwNb0Or3bzWYTqarKAQBiWbZptVoVACCCIJD4q7hvA3/53+pz3JFBIFsslqbVaq0Hg8Gc1+tNzM7OZocVMoxyy2wEIUQxxg2n0ylFo9HNWCz2YtI/fcevLHzil0e4hS6nxW/W+7fQekMku922opW6pe55wNFAroZCoaTH49mYnZ0d2hbZyMhjNoIQUrxeb3liYqINWl34JKBcegAjCjpdSom31/qDppRihnE0OSzsuPXzUUCORCLJc+fObc3MzOQwxkMNGUa9m9Gdjz76iP793/+9wjBMHWOsUBk11DJbAYpcFb3LMezdDG0a7UEowdVGzZEv58MWbGv6uroczWZTzZfzwZX6Z/9FRbJVn+tAkFmWlfWuRWpqamqoNr3tlTPTMhsxdixMTk5uTU9Pvwy4ovf98oXFoHx5ZFvoVDkp3n759dVnr9ot9NbWVjifz4cLhYKrAVWXUX9QyDzPyy6XKz8zM5McJchwFjGDDtrr9VZEUUzEYrF4yDP50K9eWAzKo7vZLlFKil+tfnX1yatn7yiK4igWi46tra2JSiMfQ0j7r2JQyBaLRbHb7aVgMJh2OBwjBRnOKmbQ+9Aul6skiuLm5ORkPOCaeOQnFxdDygiDLqfEr17eboFuNKou4ORpGBAyx3GKxWJRbDZbMRKJJGZmZobiWIuD5kz1mbvz4YcfErvdLquqqqiqimVZkXHDnqeAXFXIhQCI9mMe0j6z+TWlAIRSXK1XHblyIWzFXNMjuCXZmv6exDz97iCQWZZVeZ6vBIPBxMLCQgohVBv2lb1eObMtM+ib7RBCzVgsJgUCgUTQF0547P6lELm4GFAXRrMPTbUux83l21cfrT38UQG/ujgIZIwx4Xm+Fg6HM5OTkxmEUHXY9uztN2caM5hABwKBbCgU2vT5AkmP3b8UohcXg3ThAZDRO9pOA50Sv4nf/kkRvZwbBLKxCc509NtIQobXATOYtnCEw+FkNBrVQDs10CE6mtuhKVJZmSn7ZVz0HgYyy7KqxWKpGJBHbctFr7wWmMEEOhQKJaLR6GbAG9r2OcLfhuDiYphcegB0tECzLILgBIsYDOggkHsdj3wWIMPrhBlMoBcWFraj0Wg8FovFA66JRwHm4mKEXHoAMDqgOQ7B5BR7oBZ52I9HHjSvFWbQQSOEqhcvXkxOTEzEY7HYWsQTeRhkLi5O0NEAjTECt48FX7ATMqiYqhVXYTfIw3w88qB57TCDDhoA6rFYLBsMBtejURNoGH7QHIdAnOaA5zshK2VHQY7P3doL8rAejzxoXkvMoIEmANAwH+Af8UQeBtHFxTBcGF7QCMAuIBDPIWAYE+SSo6Csz91iKxO39wl55LYj75XXFjOYNtuZQQd9kYcT+PJiBF14ADB8m+04FsFElAO3t7NFVjbmbrHVia93O9XpLEOG1x0z9AAdM4GewBeHqoVGAGB3YJhdYAFjE+R1DbLtNYYMY8xa+oJmLi9GmYtD00KzLILoJAf+8Bhyr4wx69kVNLr4AJ1yC40QgOBAWqtMx5B7ZYzZlH6go/zpt9Ach2BqhgOvfwy5X8aYu9IP9CR/eXGSPZ0+NMYIPF4WZuZ4SqpjyP0yxtwju4Ge4C4+QOhkW2iLFcHsHEdtzBjybhlj7pN+oGP85cUod3J9aJZFEInwdCLgLqj65rcx5N4ZY94lvUCHfJGHMYvW5cDoeEEjBOBys/T8lLuAM2PIe2WMeY/0BW2/vCiyFx8wxwQaIQCHg6Wzorvors3dYmtjyHtljHkf6QtauLw4yV18wBzxVg4EADYbQ2en3cUwc/EW25gcQ95Hxpj3mX6gp+yXP5lgLt7isbXaPc1hw1sYOj3pyUe5i7esSvSrMeT9ZYz5AOkFOuKLPpp1fXdxir1804Fd+e5pDhqew3Qq4ipNWS7essqTY8gHyBjzAdMNenJyMh70BpcnHRc+88nTN/xMZLN7mv2G4zCdCDjLMevFr20kensM+WDZ7Uqo4+wSSimilPLxeNyXSqXE9fV1MZ1Oi6nyxvclSP1RqrE2V1NrdkoQUEKBEABKtWdtGIAS0MdRwBjRoEsoT1nmbwUt5762Wu2JMeSDZYx5gHSD3trampAkKZiv5mdeJZ98TxZqC5n6lthUZX5XzCoibqszP++ZvedlxS+dgnPcIh8iY8wDxgw6n89HkslkMJfLBTK5TLBYy17YzMUvEEE5V5RzgZJc8JgxA0HUgqwVHxtcsyr2F+cn5h85rI5xi3zIjDEfQQzQ5XLZubm56U8mkyFJkvy5XM5bqVV8xZp0PlNIRgo1KSR4HQ5KKUNVoEpdLVMZChG3uGrjbZselyfvcDiKY8iHyxjzEUa/RYP1xYsX3nw+H8zn875SqeSSJMldq9WEptK0I0TdChAWAAgmuKKqatPKW+t2u71ss9mqVqu1YUD2eDz5UCi0PYa8v4wxH3EopZhSypVKJUcymfTk83lfLpfzVKtVZ6PRsDabTY4QggAAMMYUAAjHcQrP802MscLzvMJxXC0QCBRcLldqbm5uqG+9MEwZYz6mUEoZALCUy2XHxsaGN5fL+YvForNer/MIoY7lTimlHMcRhmEUQRDKPp9Pstls2fPnzxcRQo0x5P1ljPkYQynF+rZ86/r6urtYLLqr1apACOl59VXj3izhcFjyer1V/ZoW5muNjrNLxphPIDpqllJqrVQq1kwms2NnFSGEBgIBxel0VhFCzbN2TYuTyBjzCcbUUvcL1bsU49Z4nHHGGWecccYZZ5xxxhlnnHH65f8HOp3r7iXW2UkAAAAASUVORK5CYII=";

  try {
    if (SETTINGS.oncePerSession && sessionStorage.getItem("gidSplashShown")) return;
    sessionStorage.setItem("gidSplashShown", "1");
  } catch (e) {}

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) SETTINGS.durationMs = 1800;

  if (!document.getElementById("gs-font")) {
    var lf = document.createElement("link");
    lf.id = "gs-font"; lf.rel = "stylesheet";
    lf.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(lf);
  }

  // timing (seconds) — when the solid logo appears and the text starts
  var T_LOGO = 2.35, T_TEXT = 2.55;

  var css = `
#gid-splash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 90% at 50% 45%,#12331f 0%,#081a10 45%,#030a06 100%);color:#eaf3ec;
  font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;
  transition:opacity .8s cubic-bezier(.4,0,.2,1)}
#gid-splash *{box-sizing:border-box}
#gid-splash canvas{position:absolute;inset:0;width:100%;height:100%;z-index:1}
#gid-splash .gs-grid{position:absolute;inset:0;opacity:0;
  background-image:linear-gradient(rgba(140,198,63,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(140,198,63,.05) 1px,transparent 1px);
  background-size:48px 48px;-webkit-mask-image:radial-gradient(circle at 50% 45%,#000,transparent 65%);mask-image:radial-gradient(circle at 50% 45%,#000,transparent 65%);
  animation:gsIn 2s .2s ease forwards}
#gid-splash .gs-aura{position:absolute;width:60vmin;height:60vmin;border-radius:50%;left:50%;top:40%;transform:translate(-50%,-50%) scale(.3);
  background:radial-gradient(circle,rgba(141,198,63,.3) 0%,rgba(46,125,50,.1) 40%,transparent 70%);opacity:0;
  animation:gsAura 1.4s ${T_LOGO - 0.3}s cubic-bezier(.2,.8,.2,1) forwards}
#gid-splash .gs-stage{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px;
  transition:opacity .5s ease,transform .8s cubic-bezier(.4,0,.2,1)}
#gid-splash .gs-markbox{position:relative;width:min(190px,42vw);aspect-ratio:1;display:grid;place-items:center;margin-bottom:22px}
#gid-splash .gs-logo{width:78%;aspect-ratio:179/189;background:url(LOGO_URL) center/contain no-repeat;opacity:0;
  filter:brightness(1.8) blur(2px);animation:gsSolid .7s ${T_LOGO}s ease forwards,gsGlow 3s ${T_LOGO + 0.8}s ease-in-out infinite}
#gid-splash .gs-ring{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px;border-radius:50%;border:1.5px solid rgba(160,220,90,.8);opacity:0;
  animation:gsRing 1.1s ${T_LOGO}s cubic-bezier(.1,.7,.3,1) forwards}
#gid-splash .gs-title{font-family:Cinzel,"Trajan Pro","Times New Roman",serif;font-weight:400;font-size:clamp(26px,6.2vw,46px);letter-spacing:.06em;line-height:1.1;margin:0;white-space:nowrap}
#gid-splash .gs-title .w{display:inline-block;margin:0 .14em}
#gid-splash .gs-title .ch{display:inline-block;opacity:0;filter:blur(8px);transform:translateY(-14px) scale(1.4);animation:gsLetter .6s cubic-bezier(.2,.8,.2,1) forwards}
#gid-splash .gs-green .ch{color:#8dc63f;text-shadow:0 0 18px rgba(141,198,63,.45)}
#gid-splash .gs-rest .ch{color:#e9efe9}
#gid-splash .gs-rule{height:1px;width:0;margin:14px auto 12px;background:linear-gradient(90deg,transparent,#8dc63f,transparent);animation:gsRule .9s ${T_TEXT + 0.75}s cubic-bezier(.6,0,.2,1) forwards}
#gid-splash .gs-sub{font-family:Cinzel,"Times New Roman",serif;font-size:clamp(11px,2.4vw,15px);color:#b9c8bd;text-transform:uppercase;letter-spacing:1.4em;opacity:0;margin-right:-.4em;
  animation:gsTrack 1.2s ${T_TEXT + 0.8}s cubic-bezier(.2,.8,.2,1) forwards}
#gid-splash .gs-services{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:22px}
#gid-splash .gs-chip{font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#d7ead9;padding:6px 12px;border-radius:999px;
  background:rgba(141,198,63,.08);border:1px solid rgba(141,198,63,.28);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  opacity:0;transform:translateY(10px) scale(.9);animation:gsChip .55s cubic-bezier(.2,.8,.2,1.3) forwards}
#gid-splash .gs-bottom{position:absolute;z-index:2;left:50%;bottom:max(38px,6vh);transform:translateX(-50%);width:min(340px,78vw);opacity:0;animation:gsIn .6s .8s ease forwards}
#gid-splash .gs-app{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#8dc63f;text-align:center;margin-bottom:12px;font-weight:600}
#gid-splash .gs-track{position:relative;height:3px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
#gid-splash .gs-bar{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:3px;background:linear-gradient(90deg,#2e7d32,#8dc63f,#c6f27a);box-shadow:0 0 12px rgba(141,198,63,.8);transition:width .45s cubic-bezier(.4,0,.2,1)}
#gid-splash .gs-meta{display:flex;justify-content:space-between;margin-top:9px;font-size:11.5px;color:#8fa596;font-variant-numeric:tabular-nums}
#gid-splash .gs-status{transition:opacity .25s ease}
#gid-splash .gs-skip{position:absolute;z-index:2;top:22px;right:22px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(234,243,236,.45);opacity:0;animation:gsIn .6s 1.2s ease forwards}
#gid-splash.gs-exit{opacity:0}
#gid-splash.gs-exit .gs-logo{animation:none;opacity:0;transition:opacity .15s}
#gid-splash.gs-exit .gs-stage>*:not(.gs-markbox),#gid-splash.gs-exit .gs-bottom{opacity:0!important;transition:opacity .3s}
@keyframes gsIn{to{opacity:1}}
@keyframes gsAura{to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes gsSolid{to{opacity:1;filter:brightness(1) blur(0) drop-shadow(0 10px 30px rgba(141,198,63,.35))}}
@keyframes gsGlow{0%,100%{filter:drop-shadow(0 10px 30px rgba(141,198,63,.35))}50%{filter:drop-shadow(0 10px 46px rgba(141,198,63,.65))}}
@keyframes gsRing{0%{opacity:.9;width:12px;height:12px;margin:-6px}100%{opacity:0;width:380px;height:380px;margin:-190px}}
@keyframes gsLetter{to{opacity:1;filter:blur(0);transform:none}}
@keyframes gsRule{to{width:min(280px,70vw)}}
@keyframes gsTrack{to{opacity:1;letter-spacing:.38em}}
@keyframes gsChip{to{opacity:1;transform:none}}
@media (max-width:480px){#gid-splash .gs-services{gap:6px}#gid-splash .gs-chip{font-size:9.5px;letter-spacing:.12em;padding:5px 9px}}
@media (prefers-reduced-motion:reduce){#gid-splash *{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
`.replace(/LOGO_URL/g, LOGO);

  var style = document.createElement("style");
  style.id = "gid-splash-style"; style.textContent = css;
  document.head.appendChild(style);

  function letters(word, start, step) {
    return word.split("").map(function (c, i) {
      return '<span class="ch" style="animation-delay:' + (start + i * step).toFixed(2) + 's">' + c + "</span>";
    }).join("");
  }
  var chips = SETTINGS.services.map(function (s, i) {
    return '<span class="gs-chip" style="animation-delay:' + (T_TEXT + 1.05 + i * 0.13).toFixed(2) + 's">' + s + "</span>";
  }).join("");

  var root = document.createElement("div");
  root.id = "gid-splash";
  root.setAttribute("role", "status");
  root.setAttribute("aria-label", "Loading GID " + SETTINGS.appName);
  root.innerHTML =
    '<div class="gs-grid"></div><div class="gs-aura"></div><canvas></canvas>' +
    (SETTINGS.allowSkip ? '<div class="gs-skip">Tap to skip</div>' : "") +
    '<div class="gs-stage">' +
      '<div class="gs-markbox"><span class="gs-ring"></span><div class="gs-logo"></div></div>' +
      '<h1 class="gs-title"><span class="w gs-green">' + letters("GREEN", T_TEXT, 0.06) + "</span>" +
        '<span class="w gs-rest">' + letters("IN", T_TEXT + 0.3, 0.06) + "</span>" +
        '<span class="w gs-rest">' + letters("DESIGN", T_TEXT + 0.42, 0.06) + "</span></h1>" +
      '<div class="gs-rule"></div><div class="gs-sub">Interior &amp; Exterior</div>' +
      '<div class="gs-services">' + chips + "</div>" +
    "</div>" +
    '<div class="gs-bottom"><div class="gs-app">GID ' + SETTINGS.appName + "</div>" +
      '<div class="gs-track"><div class="gs-bar"></div></div>' +
      '<div class="gs-meta"><span class="gs-status">' + SETTINGS.statusSteps[0] + '</span><span class="gs-pct">0%</span></div>' +
    "</div>";

  var prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";


  // ================= PARTICLE ENGINE =================
  var cv, ctx, W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var parts = [], dust = [], raf, t0 = 0, phase = "build", exitAt = 0;
  var pointer = { x: -9999, y: -9999 };
  var img = new Image();

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

  // read the logo's pixels and turn every few pixels into a particle target
  function buildTargets() {
    var box = root.querySelector(".gs-logo").getBoundingClientRect();
    var bw = Math.round(box.width), bh = Math.round(box.height);
    if (!bw || !bh) return [];
    var oc = document.createElement("canvas"); oc.width = bw; oc.height = bh;
    var octx = oc.getContext("2d");
    octx.drawImage(img, 0, 0, bw, bh);
    var data = octx.getImageData(0, 0, bw, bh).data;
    var gap = Math.max(2, Math.round(bw / 58)), out = [];
    for (var y = 0; y < bh; y += gap) {
      for (var x = 0; x < bw; x += gap) {
        var k = (y * bw + x) * 4;
        if (data[k + 3] > 140) out.push({ x: box.left + x, y: box.top + y, c: "rgb(" + data[k] + "," + data[k + 1] + "," + data[k + 2] + ")", s: gap * 0.62 });
      }
    }
    return out;
  }

  function setup() {
    W = root.clientWidth; H = root.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var targets = buildTargets(), R = Math.hypot(W, H) * 0.6, cx = W / 2, cy = H / 2;
    var old = parts;
    parts = targets.map(function (t, i) {
      var a = Math.random() * Math.PI * 2, r = R * (0.55 + Math.random() * 0.5);
      var p = old[i] || {
        sx: cx + Math.cos(a) * r, sy: cy + Math.sin(a) * r,
        delay: 0.25 + Math.random() * 0.75, dur: 1.05 + Math.random() * 0.45,
        spin: (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.6),
        vx: 0, vy: 0, x: 0, y: 0, a: 1
      };
      p.tx = t.x; p.ty = t.y; p.c = t.c; p.s = t.s;
      return p;
    });
    dust = [];
    var n = Math.min(70, Math.round((W * H) / 18000));
    for (var j = 0; j < n; j++) dust.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: -Math.random() * .35 - .05, r: Math.random() * 1.4 + .4, a: Math.random() * .5 + .15 });
  }

  function frame(now) {
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);

    // floating dust in the background
    for (var d = 0; d < dust.length; d++) {
      var q = dust[d]; q.x += q.vx; q.y += q.vy;
      if (q.y < -5) { q.y = H + 5; q.x = Math.random() * W; }
      ctx.fillStyle = "rgba(160,215,100," + (q.a * Math.min(1, t / 1.2)).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill();
    }

    // logo particles: visible while assembling, fade out as the solid logo appears
    var logoFade = phase === "exit" ? 1 : 1 - Math.min(1, Math.max(0, (t - T_LOGO) / 0.55));
    var cx = W / 2, cy = H * 0.42;
    if (logoFade > 0 || phase === "exit") {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (phase === "exit") {
          p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy *= 0.985; p.vy += 0.04; p.a *= 0.965;
        } else {
          var k = (t - p.delay) / p.dur;
          if (k <= 0) { p.x = p.sx; p.y = p.sy; p.a = Math.min(1, t / 0.6) * 0.5; }
          else if (k < 1) {
            // spiral inward from start point to target
            var e = easeOutCubic(k), ang = (1 - e) * p.spin;
            var dx = (p.sx - p.tx) * (1 - e), dy = (p.sy - p.ty) * (1 - e);
            var cs = Math.cos(ang), sn = Math.sin(ang);
            p.x = p.tx + dx * cs - dy * sn; p.y = p.ty + dx * sn + dy * cs;
            p.a = 0.5 + 0.5 * e; p.vx = p.vy = 0;
          } else {
            // settled: springs to its place, scatters away from the mouse/finger
            var mx = p.x - pointer.x, my = p.y - pointer.y, md = mx * mx + my * my;
            if (md < 3600) { var f = (3600 - md) / 3600 * 2.2, ml = Math.sqrt(md) || 1; p.vx += mx / ml * f; p.vy += my / ml * f; }
            p.vx += (p.tx - p.x) * 0.08; p.vy += (p.ty - p.y) * 0.08;
            p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy; p.a = 1;
          }
        }
        var alpha = p.a * logoFade;
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      ctx.globalAlpha = 1;
    }

    // a bright flash when everything snaps together
    var fl = t - (T_LOGO - 0.15);
    if (fl > 0 && fl < 0.6 && phase !== "exit") {
      var b = root.querySelector(".gs-logo").getBoundingClientRect();
      var g = ctx.createRadialGradient(b.left + b.width / 2, b.top + b.height / 2, 0, b.left + b.width / 2, b.top + b.height / 2, b.width);
      g.addColorStop(0, "rgba(220,255,170," + (0.45 * (1 - fl / 0.6)).toFixed(3) + ")"); g.addColorStop(1, "rgba(220,255,170,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    raf = requestAnimationFrame(frame);
  }

  function initProgress() {
    var bar = root.querySelector(".gs-bar"), pct = root.querySelector(".gs-pct"), st = root.querySelector(".gs-status");
    var steps = SETTINGS.statusSteps, total = SETTINGS.durationMs - 500, startAt = 800, shown = 0;
    var timer = setInterval(function () {
      var el = performance.now() - t0 - startAt;
      if (el < 0) return;
      var k = Math.min(1, el / (total - startAt)), v = Math.round((1 - Math.pow(1 - k, 2.2)) * 100);
      bar.style.width = v + "%"; pct.textContent = v + "%";
      var idx = k >= 1 ? steps.length - 1 : Math.min(steps.length - 1, Math.floor(k * steps.length));
      if (idx !== shown) { shown = idx; st.style.opacity = 0; setTimeout(function () { st.textContent = steps[idx]; st.style.opacity = 1; }, 180); }
      if (k >= 1) clearInterval(timer);
    }, 60);
  }

  var done = false;
  function finish() {
    if (done) return; done = true;
    // burst the logo back into particles
    var b = root.querySelector(".gs-logo").getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    parts.forEach(function (p) {
      p.x = p.tx; p.y = p.ty; p.a = 1;
      var dx = p.tx - cx, dy = p.ty - cy, l = Math.hypot(dx, dy) || 1, sp = 6 + Math.random() * 10;
      p.vx = dx / l * sp + (Math.random() - .5) * 4; p.vy = dy / l * sp + (Math.random() - .5) * 4;
    });
    phase = "exit";
    root.classList.add("gs-exit");
    setTimeout(function () {
      cancelAnimationFrame(raf); root.remove(); style.remove();
      document.documentElement.style.overflow = prevOverflow;
      window.dispatchEvent(new CustomEvent("gid:splash-done"));
    }, 850);
  }

  function start() {
    cv = root.querySelector("canvas"); ctx = cv.getContext("2d");
    t0 = performance.now();
    initProgress();
    img.onload = function () {
      setup();
      window.addEventListener("resize", setup);
      // re-measure once the title font has loaded (the logo may shift slightly)
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(setup);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    img.src = LOGO;
    root.addEventListener("pointermove", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; });
    root.addEventListener("pointerleave", function () { pointer.x = pointer.y = -9999; });
    setTimeout(finish, SETTINGS.durationMs);
    if (SETTINGS.allowSkip) setTimeout(function () {
      root.addEventListener("click", finish);
      window.addEventListener("keydown", finish, { once: true });
    }, 700);
  }

  // start once everything above is ready
  function mount() { (document.body || document.documentElement).appendChild(root); start(); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  window.GIDSplash = { replay: function () { try { sessionStorage.removeItem("gidSplashShown"); } catch (e) {} location.reload(); } };
})();
